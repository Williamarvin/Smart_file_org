import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";

interface ValidationReportData {
  reportTitle: string;
  sessionId?: string;
  originalParameters: {
    courseTitle?: string;
    targetAudience?: string;
    teachingStyle?: string;
    expertiseSubject?: string;
    actionTypes?: string[];
    durations?: number[];
    difficultyLevels?: string[];
    additionalContext?: string;
  };
  actualParameters: {
    courseTitle?: string;
    targetAudience?: string;
    teachingStyle?: string;
    expertiseSubject?: string;
    actionTypes?: string[];
    durations?: number[];
    difficultyLevels?: string[];
  };
  deviations: Array<{
    field: string;
    original: any;
    actual: any;
    severity: "high" | "medium" | "low";
  }>;
  complianceScore: number;
  createdAt: Date;
}

export class PDFGenerator {
  private static ensureReportsDirectory(): string {
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    return reportsDir;
  }

  static async generateValidationReport(
    data: ValidationReportData,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const chunks: Buffer[] = [];

        // Collect PDF data
        doc.on("data", (chunk: Buffer) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);

        // Header
        doc
          .fontSize(24)
          .fillColor("#2563eb")
          .text("Teacher Session Validation Report", { align: "center" });
        doc.moveDown();

        // Report metadata
        doc.fontSize(12).fillColor("#666666");
        doc.text(`Report Title: ${data.reportTitle}`);
        doc.text(`Generated: ${new Date(data.createdAt).toLocaleString()}`);
        if (data.sessionId) {
          doc.text(`Session ID: ${data.sessionId}`);
        }
        doc.moveDown();

        // Compliance Score
        const scoreColor =
          data.complianceScore >= 80
            ? "#22c55e"
            : data.complianceScore >= 60
              ? "#f59e0b"
              : "#ef4444";
        doc
          .fontSize(16)
          .fillColor("#000000")
          .text("Compliance Score: ", { continued: true });
        doc.fillColor(scoreColor).text(`${data.complianceScore.toFixed(1)}%`);
        doc.moveDown();

        // Draw a progress bar for compliance score
        const barWidth = 400;
        const barHeight = 20;
        const filledWidth = (data.complianceScore / 100) * barWidth;

        doc.rect(doc.x, doc.y, barWidth, barHeight).stroke("#cccccc");
        doc.rect(doc.x, doc.y, filledWidth, barHeight).fill(scoreColor);
        doc.moveDown(2);

        // Original Parameters Section
        doc
          .fontSize(14)
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .text("Original Parameters");
        doc.font("Helvetica").fontSize(11).fillColor("#333333");
        this.renderParameters(doc, data.originalParameters);
        doc.moveDown();

        // Actual Parameters Section
        doc
          .fontSize(14)
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .text("Actual Parameters (From Chat Session)");
        doc.font("Helvetica").fontSize(11).fillColor("#333333");
        this.renderParameters(doc, data.actualParameters);
        doc.moveDown();

        // Deviations Section
        if (data.deviations && data.deviations.length > 0) {
          doc
            .fontSize(14)
            .fillColor("#000000")
            .font("Helvetica-Bold")
            .text("Deviations Found");
          doc.font("Helvetica").fontSize(11);

          data.deviations.forEach((deviation, index) => {
            const severityColor =
              deviation.severity === "high"
                ? "#ef4444"
                : deviation.severity === "medium"
                  ? "#f59e0b"
                  : "#3b82f6";

            doc
              .fillColor(severityColor)
              .text(
                `${index + 1}. ${deviation.field} [${deviation.severity.toUpperCase()}]`,
              );
            doc.fillColor("#333333");
            doc.text(`   Original: ${this.formatValue(deviation.original)}`);
            doc.text(`   Actual: ${this.formatValue(deviation.actual)}`);
            doc.moveDown(0.5);
          });
        } else {
          doc.fontSize(14).fillColor("#22c55e").text("No Deviations Found");
          doc
            .fontSize(11)
            .fillColor("#333333")
            .text(
              "The session parameters match the original request perfectly.",
            );
        }
        doc.moveDown();

        // Summary
        doc
          .fontSize(14)
          .fillColor("#000000")
          .font("Helvetica-Bold")
          .text("Summary");
        doc.font("Helvetica").fontSize(11).fillColor("#333333");

        if (data.complianceScore >= 90) {
          doc.text(
            "The teacher session closely follows the original parameters with minimal deviations.",
          );
        } else if (data.complianceScore >= 70) {
          doc.text(
            "The teacher session generally follows the original parameters with some notable deviations.",
          );
        } else if (data.complianceScore >= 50) {
          doc.text(
            "The teacher session moderately deviates from the original parameters.",
          );
        } else {
          doc.text(
            "The teacher session significantly deviates from the original parameters and may require review.",
          );
        }

        // Footer
        doc.moveDown(2);
        doc
          .fontSize(10)
          .fillColor("#999999")
          .text(
            "This report was automatically generated by the Smart File Organizer validation system.",
            { align: "center" },
          );

        // Finalize PDF
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private static renderParameters(doc: any, params: any): void {
    if (params.courseTitle) {
      doc.text(`• Course Title: ${params.courseTitle}`);
    }
    if (params.targetAudience) {
      doc.text(`• Target Audience: ${params.targetAudience}`);
    }
    if (params.teachingStyle) {
      doc.text(`• Teaching Style: ${params.teachingStyle}`);
    }
    if (params.expertiseSubject) {
      doc.text(`• Expertise Subject: ${params.expertiseSubject}`);
    }
    if (params.actionTypes && params.actionTypes.length > 0) {
      doc.text(`• Action Types: ${params.actionTypes.join(", ")}`);
    }
    if (params.durations && params.durations.length > 0) {
      doc.text(
        `• Durations: ${params.durations.map((d: number) => `${d} min`).join(", ")}`,
      );
    }
    if (params.difficultyLevels && params.difficultyLevels.length > 0) {
      doc.text(`• Difficulty Levels: ${params.difficultyLevels.join(", ")}`);
    }
    if (params.additionalContext) {
      doc.text(`• Additional Context: ${params.additionalContext}`);
    }
  }

  private static formatValue(value: any): string {
    if (value === null || value === undefined) {
      return "Not specified";
    }
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    if (typeof value === "object") {
      return JSON.stringify(value, null, 2);
    }
    return String(value);
  }

  static async saveReportToFile(
    data: ValidationReportData,
    filename: string,
  ): Promise<string> {
    const reportsDir = this.ensureReportsDirectory();
    const filepath = path.join(reportsDir, filename);
    const pdfBuffer = await this.generateValidationReport(data);

    fs.writeFileSync(filepath, pdfBuffer);
    return filepath;
  }
}
