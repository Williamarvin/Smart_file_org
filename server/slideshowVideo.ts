import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";

export async function generateSlideshowVideo(
  slides: string[],
  narrationBuffer: Buffer,
): Promise<Buffer> {
  console.log(
    `Creating slideshow video with ${slides.length} slides and narration...`,
  );

  const tempVideoFile = path.join("/tmp", `slideshow_${Date.now()}.mp4`);
  const tempAudioFile = path.join("/tmp", `narration_${Date.now()}.mp3`);

  try {
    // Save narration audio to temp file if we have it
    if (narrationBuffer && narrationBuffer.length > 0) {
      await fs.promises.writeFile(tempAudioFile, narrationBuffer);
      console.log(`Saved narration audio: ${narrationBuffer.length} bytes`);
    }

    return new Promise((resolve, reject) => {
      // Calculate slide duration - increased to 90 seconds for more content
      const totalDuration = 90; // Increased from 60 to 90 seconds
      const slideDuration = Math.floor(totalDuration / slides.length);

      // Build FFmpeg command
      const ffmpegArgs = [];

      // Video input (dark background)
      ffmpegArgs.push(
        "-f",
        "lavfi",
        "-i",
        `color=c=0x1e293b:size=1280x720:duration=${totalDuration}:rate=30`,
      );

      // Add audio input if we have narration
      if (narrationBuffer && narrationBuffer.length > 0) {
        ffmpegArgs.push("-i", tempAudioFile);
      } else {
        // Add silent audio track
        ffmpegArgs.push(
          "-f",
          "lavfi",
          "-i",
          `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${totalDuration}`,
        );
      }

      // Build filter complex for slides
      const slideFilters = [];

      slides.forEach((slide, slideIndex) => {
        const lines = slide.split("\n").filter((line) => line.trim());
        const startTime = slideIndex * slideDuration;
        const endTime = (slideIndex + 1) * slideDuration;

        // Title (first line)
        const title = (lines[0] || `Slide ${slideIndex + 1}`).substring(0, 50);
        const titleFilter = `drawtext=text='${title.replace(/'/g, "\\'").replace(/:/g, "\\:")}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=120:enable='between(t,${startTime},${endTime})'`;
        slideFilters.push(titleFilter);

        // Bullet points
        lines.slice(1, 5).forEach((line, lineIndex) => {
          const yPos = 240 + lineIndex * 70;
          const cleanLine = line
            .replace(/[•\-*]/g, "•")
            .trim()
            .substring(0, 60);
          if (cleanLine) {
            const bulletFilter = `drawtext=text='${cleanLine.replace(/'/g, "\\'").replace(/:/g, "\\:")}':fontcolor=white:fontsize=24:x=100:y=${yPos}:enable='between(t,${startTime + 0.5},${endTime})'`;
            slideFilters.push(bulletFilter);
          }
        });

        // Slide number indicator
        const slideNumberFilter = `drawtext=text='${slideIndex + 1}/${slides.length}':fontcolor=white@0.7:fontsize=18:x=w-100:y=h-50:enable='between(t,${startTime},${endTime})'`;
        slideFilters.push(slideNumberFilter);

        // Slide transition line
        if (slideIndex < slides.length - 1) {
          const transitionTime = endTime - 0.5;
          const transitionFilter = `drawbox=x=0:y=360:w='iw*(t-${transitionTime})/0.5':h=2:color=white@0.5:enable='between(t,${transitionTime},${endTime})'`;
          slideFilters.push(transitionFilter);
        }
      });

      // Add header and footer
      slideFilters.push(
        `drawtext=text='AI GENERATED SLIDESHOW':fontcolor=white@0.5:fontsize=16:x=(w-text_w)/2:y=30`,
        `drawbox=x=50:y=80:w=iw-100:h=2:color=white@0.3:t=1`,
      );

      // Combine all filters
      const filterComplex = `[0:v]${slideFilters.join(",")}[video]`;

      ffmpegArgs.push("-filter_complex", filterComplex);

      // Output settings
      ffmpegArgs.push(
        "-map",
        "[video]", // Map video
        "-map",
        "1:a", // Map audio (narration or silence)
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "44100",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-t",
        `${totalDuration}`, // Duration: 90 seconds for more content
        "-y", // Overwrite output
        tempVideoFile,
      );

      console.log("Starting FFmpeg with slideshow generation...");
      const ffmpeg = spawn(ffmpegPath!, ffmpegArgs);

      let errorOutput = "";
      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString();
        errorOutput += output;
        // Log progress
        if (output.includes("time=")) {
          const match = output.match(/time=(\d{2}:\d{2}:\d{2})/);
          if (match) {
            console.log(`Encoding progress: ${match[1]}`);
          }
        }
      });

      ffmpeg.on("close", async (code) => {
        try {
          // Clean up audio file if it exists
          if (fs.existsSync(tempAudioFile)) {
            fs.unlinkSync(tempAudioFile);
          }

          if (code === 0 && fs.existsSync(tempVideoFile)) {
            const videoBuffer = fs.readFileSync(tempVideoFile);
            fs.unlinkSync(tempVideoFile);
            console.log(
              `✅ Generated slideshow video: ${videoBuffer.length} bytes`,
            );
            resolve(videoBuffer);
          } else {
            console.error(`FFmpeg failed with code ${code}`);
            console.error("FFmpeg output:", errorOutput.slice(-2000));
            reject(new Error(`Video generation failed with code ${code}`));
          }
        } catch (error) {
          console.error("Error processing video:", error);
          reject(error);
        }
      });

      ffmpeg.on("error", (error) => {
        console.error("FFmpeg error:", error.message);
        // Clean up temp files
        if (fs.existsSync(tempAudioFile)) {
          fs.unlinkSync(tempAudioFile);
        }
        reject(error);
      });
    });
  } catch (error) {
    // Clean up temp files on error
    if (fs.existsSync(tempAudioFile)) {
      fs.unlinkSync(tempAudioFile);
    }
    throw error;
  }
}
