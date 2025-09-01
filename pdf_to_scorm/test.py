import os
import zipfile
from pathlib import Path
import PyPDF2
import html
import re
import time
import openai
import json
from typing import Dict, List, Optional

# ------------ CONFIG ------------
PDF_INPUT = './pdf_to_scorm/Lesson Plan 2 - Argument Construction.docx.pdf'
PACKAGE_TITLE = 'Lesson Plan 2 - Argument Construction'
SCO_IDENTIFIER = 'SCO-1'
ORG_IDENTIFIER = 'ORG-1'
COURSE_IDENTIFIER = 'COURSE-ARG-CONSTRUCT'
OUTPUT_ZIP = 'pdf_to_scorm/scorm_package.zip'
LAUNCH_FILE = 'pdf_to_scorm/index.html'  # main SCO launch page
SCORM_VERSION = '1.2'  # '1.2' or '2004'

# Initialize OpenAI client
openai.api_key = os.getenv('OPENAI_API_KEY')
client = openai.OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
# --------------------------------

def extract_pdf_text(pdf_path: str) -> str:
    with open(pdf_path, 'rb') as f:
        reader = PyPDF2.PdfReader(f)
        chunks = []
        for i, page in enumerate(reader.pages):
            try:
                t = page.extract_text() or ''
            except Exception as e:
                t = ''
            chunks.append(t)
        text = "\n".join(chunks)
        # Normalize whitespace a bit
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

def enhance_content_with_ai(raw_text: str, title: str) -> Dict:
    """Use OpenAI to analyze and enhance the PDF content"""
    # the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
    try:
        prompt = f"""
        You are an expert educational content designer. Analyze this lesson plan content and transform it into a well-structured, engaging learning module.

        Original content:
        {raw_text}

        Please analyze and enhance this content by providing:
        1. A clear, engaging introduction (2-3 sentences)
        2. Well-organized main sections with clear headings
        3. Key learning objectives (3-5 bullet points)
        4. Interactive quiz questions (3-5 multiple choice questions)
        5. A practical activity or exercise
        6. Summary and takeaways

        Return your response as JSON with this structure:
        {{
            "introduction": "engaging introduction text",
            "learning_objectives": ["objective 1", "objective 2", "objective 3"],
            "sections": [
                {{"title": "Section Title", "content": "Enhanced section content"}},
                {{"title": "Another Section", "content": "More content"}}
            ],
            "quiz": [
                {{
                    "question": "Question text?",
                    "options": ["A) Option 1", "B) Option 2", "C) Option 3", "D) Option 4"],
                    "correct": 0,
                    "explanation": "Why this is correct"
                }}
            ],
            "activity": {{"title": "Activity Title", "description": "Activity instructions"}},
            "summary": "Key takeaways and summary"
        }}
        """

        response = client.chat.completions.create(
            model="gpt-5",
            messages=[
                {"role": "system", "content": "You are an expert educational content designer who creates engaging, well-structured learning materials."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )

        enhanced_content = json.loads(response.choices[0].message.content)
        return enhanced_content

    except Exception as e:
        print(f"AI enhancement failed: {e}")
        # Fallback to basic structure
        return {
            "introduction": f"Welcome to {title}. This lesson will help you understand key concepts and develop practical skills.",
            "learning_objectives": ["Understand core concepts", "Apply knowledge practically", "Demonstrate mastery"],
            "sections": [{"title": "Content", "content": raw_text}],
            "quiz": [],
            "activity": {"title": "Practice Exercise", "description": "Apply what you've learned in a practical exercise."},
            "summary": "Review the key concepts covered in this lesson and practice applying them."
        }

def build_enhanced_html(enhanced_content: Dict, title: str) -> str:
    """Build a modern, interactive HTML learning module"""
    
    # Generate sections HTML
    sections_html = ""
    for i, section in enumerate(enhanced_content.get('sections', [])):
        sections_html += f"""
        <section class="content-section" id="section-{i}">
            <h2>{html.escape(section['title'])}</h2>
            <div class="section-content">
                {html.escape(section['content']).replace(chr(10), '<br>')}
            </div>
        </section>
        """
    
    # Generate learning objectives HTML
    objectives_html = ""
    for objective in enhanced_content.get('learning_objectives', []):
        objectives_html += f"<li>{html.escape(objective)}</li>"
    
    # Generate quiz HTML
    quiz_html = ""
    for i, quiz_item in enumerate(enhanced_content.get('quiz', [])):
        options_html = ""
        for j, option in enumerate(quiz_item['options']):
            options_html += f"""
            <label class="quiz-option">
                <input type="radio" name="quiz-{i}" value="{j}" data-correct="{j == quiz_item['correct']}">
                <span>{html.escape(option)}</span>
            </label>
            """
        
        quiz_html += f"""
        <div class="quiz-question" data-quiz="{i}">
            <h3>{html.escape(quiz_item['question'])}</h3>
            <div class="quiz-options">
                {options_html}
            </div>
            <button type="button" class="btn quiz-submit" onclick="checkAnswer({i})">Submit Answer</button>
            <div class="quiz-feedback" style="display: none;">
                <p class="explanation">{html.escape(quiz_item.get('explanation', ''))}</p>
            </div>
        </div>
        """

    # Enhanced SCORM API with progress tracking
    scorm_js = """
    ;(function(){
      // Enhanced SCORM 1.2 API adapter with progress tracking
      var API = null;
      var progress = 0;
      var totalSections = """ + str(len(enhanced_content.get('sections', []))) + """;
      var completedSections = new Set();
      
      function findAPI(win) {
        var n = 0;
        while (win && !win.API && win.parent && win.parent !== win && n < 500) {
          n++; win = win.parent;
        }
        return win.API || null;
      }
      
      function updateProgress() {
        progress = Math.round((completedSections.size / totalSections) * 100);
        document.querySelector('.progress-fill').style.width = progress + '%';
        document.querySelector('.progress-text').textContent = progress + '% Complete';
        
        if (API) {
          try {
            API.LMSSetValue("cmi.core.score.raw", progress.toString());
            API.LMSSetValue("cmi.core.lesson_status", progress === 100 ? "completed" : "incomplete");
            API.LMSCommit("");
          } catch(e){}
        }
      }
      
      function markSectionComplete(sectionId) {
        completedSections.add(sectionId);
        updateProgress();
      }
      
      function init() {
        try {
          API = findAPI(window) || (window.opener && findAPI(window.opener)) || null;
          if (API) {
            try { API.LMSInitialize(""); } catch(e){}
            updateProgress();
          }
          
          // Section intersection observer for auto-completion
          const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
              if (entry.isIntersecting && entry.intersectionRatio > 0.8) {
                setTimeout(() => markSectionComplete(entry.target.id), 2000);
              }
            });
          }, { threshold: 0.8 });
          
          document.querySelectorAll('.content-section').forEach(section => {
            observer.observe(section);
          });
          
          // Handle unload
          window.addEventListener("beforeunload", function(){
            try { API && API.LMSFinish(""); } catch(e){}
          });
        } catch(e){}
      }
      
      // Quiz functionality
      window.checkAnswer = function(quizIndex) {
        const question = document.querySelector(`[data-quiz="${quizIndex}"]`);
        const selected = question.querySelector('input[name="quiz-' + quizIndex + '"]:checked');
        const feedback = question.querySelector('.quiz-feedback');
        const submit = question.querySelector('.quiz-submit');
        
        if (!selected) {
          alert('Please select an answer');
          return;
        }
        
        const isCorrect = selected.dataset.correct === 'true';
        feedback.style.display = 'block';
        feedback.className = 'quiz-feedback ' + (isCorrect ? 'correct' : 'incorrect');
        submit.disabled = true;
        submit.textContent = isCorrect ? 'Correct!' : 'Try Again';
        
        if (isCorrect) {
          markSectionComplete('quiz-' + quizIndex);
        }
      };
      
      if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 0);
      } else {
        document.addEventListener("DOMContentLoaded", init);
      }
    })();
    """

    # Modern, beautiful HTML template
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {{
      --primary: #4f46e5;
      --primary-light: #6366f1;
      --secondary: #10b981;
      --danger: #ef4444;
      --warning: #f59e0b;
      --bg: #ffffff;
      --fg: #1f2937;
      --muted: #6b7280;
      --border: #e5e7eb;
      --card: #f9fafb;
      --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
      --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    }}
    
    * {{ box-sizing: border-box; }}
    html, body {{ height: 100%; margin: 0; }}
    
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: var(--fg);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
    }}
    
    .container {{
      max-width: 900px;
      margin: 0 auto;
      background: var(--bg);
      min-height: 100vh;
      box-shadow: var(--shadow-lg);
    }}
    
    header {{
      background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
      color: white;
      padding: 2rem;
      text-align: center;
      position: relative;
      overflow: hidden;
    }}
    
    header::before {{
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
      opacity: 0.3;
    }}
    
    header h1 {{
      margin: 0;
      font-size: 2.5rem;
      font-weight: 700;
      position: relative;
      z-index: 1;
    }}
    
    header .subtitle {{
      margin: 0.5rem 0 0 0;
      font-size: 1.1rem;
      opacity: 0.9;
      position: relative;
      z-index: 1;
    }}
    
    .progress-container {{
      background: var(--card);
      padding: 1rem 2rem;
      border-bottom: 1px solid var(--border);
    }}
    
    .progress-bar {{
      background: #e5e7eb;
      height: 8px;
      border-radius: 4px;
      overflow: hidden;
      margin-bottom: 0.5rem;
    }}
    
    .progress-fill {{
      background: linear-gradient(90deg, var(--secondary), var(--primary));
      height: 100%;
      width: 0%;
      transition: width 0.3s ease;
      border-radius: 4px;
    }}
    
    .progress-text {{
      font-size: 0.875rem;
      color: var(--muted);
      text-align: center;
    }}
    
    main {{
      padding: 2rem;
    }}
    
    .intro-section {{
      background: var(--card);
      padding: 2rem;
      border-radius: 12px;
      margin-bottom: 2rem;
      border-left: 4px solid var(--primary);
    }}
    
    .intro-section h2 {{
      margin-top: 0;
      color: var(--primary);
    }}
    
    .objectives {{
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      padding: 1.5rem;
      border-radius: 12px;
      margin-bottom: 2rem;
    }}
    
    .objectives h3 {{
      margin-top: 0;
      color: #92400e;
    }}
    
    .objectives ul {{
      margin: 0;
      padding-left: 1.5rem;
    }}
    
    .objectives li {{
      margin-bottom: 0.5rem;
      color: #a16207;
    }}
    
    .content-section {{
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 2rem;
      margin-bottom: 2rem;
      box-shadow: var(--shadow);
    }}
    
    .content-section h2 {{
      margin-top: 0;
      color: var(--primary);
      font-size: 1.5rem;
      border-bottom: 2px solid var(--border);
      padding-bottom: 0.5rem;
    }}
    
    .section-content {{
      font-size: 1.1rem;
      line-height: 1.7;
    }}
    
    .quiz-section {{
      background: linear-gradient(135deg, #e0f2fe 0%, #b3e5fc 100%);
      padding: 2rem;
      border-radius: 12px;
      margin: 2rem 0;
    }}
    
    .quiz-question {{
      background: white;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      box-shadow: var(--shadow);
    }}
    
    .quiz-question h3 {{
      margin-top: 0;
      color: var(--fg);
    }}
    
    .quiz-options {{
      margin: 1rem 0;
    }}
    
    .quiz-option {{
      display: block;
      padding: 0.75rem;
      margin-bottom: 0.5rem;
      background: var(--card);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 2px solid transparent;
    }}
    
    .quiz-option:hover {{
      background: #f3f4f6;
      border-color: var(--primary);
    }}
    
    .quiz-option input {{
      margin-right: 0.75rem;
    }}
    
    .btn {{
      background: var(--primary);
      color: white;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 6px;
      cursor: pointer;
      font-size: 1rem;
      transition: all 0.2s ease;
    }}
    
    .btn:hover {{
      background: var(--primary-light);
      transform: translateY(-1px);
    }}
    
    .btn:disabled {{
      background: var(--muted);
      cursor: not-allowed;
      transform: none;
    }}
    
    .quiz-feedback {{
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 6px;
    }}
    
    .quiz-feedback.correct {{
      background: #d1fae5;
      border: 1px solid #10b981;
      color: #065f46;
    }}
    
    .quiz-feedback.incorrect {{
      background: #fee2e2;
      border: 1px solid #ef4444;
      color: #991b1b;
    }}
    
    .activity-section {{
      background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%);
      padding: 2rem;
      border-radius: 12px;
      margin: 2rem 0;
    }}
    
    .activity-section h3 {{
      margin-top: 0;
      color: #7c3aed;
    }}
    
    .summary-section {{
      background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%);
      padding: 2rem;
      border-radius: 12px;
      margin: 2rem 0;
      text-align: center;
    }}
    
    .summary-section h3 {{
      margin-top: 0;
      color: #065f46;
    }}
    
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #111827;
        --fg: #f9fafb;
        --muted: #9ca3af;
        --border: #374151;
        --card: #1f2937;
      }}
    }}
    
    @media (max-width: 768px) {{
      header {{
        padding: 1.5rem;
      }}
      
      header h1 {{
        font-size: 2rem;
      }}
      
      main {{
        padding: 1rem;
      }}
      
      .content-section, .intro-section {{
        padding: 1.5rem;
      }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>{html.escape(title)}</h1>
      <p class="subtitle">Enhanced with AI • Interactive Learning Experience</p>
    </header>
    
    <div class="progress-container">
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
      <div class="progress-text">0% Complete</div>
    </div>
    
    <main>
      <div class="intro-section">
        <h2>Welcome to Your Learning Journey</h2>
        <p>{html.escape(enhanced_content.get('introduction', ''))}</p>
      </div>
      
      <div class="objectives">
        <h3>🎯 Learning Objectives</h3>
        <ul>
          {objectives_html}
        </ul>
      </div>
      
      {sections_html}
      
      {f'''
      <div class="quiz-section">
        <h3>🧠 Knowledge Check</h3>
        {quiz_html}
      </div>
      ''' if enhanced_content.get('quiz') else ''}
      
      {f'''
      <div class="activity-section">
        <h3>🚀 {html.escape(enhanced_content.get('activity', {}).get('title', 'Practice Activity'))}</h3>
        <p>{html.escape(enhanced_content.get('activity', {}).get('description', ''))}</p>
      </div>
      ''' if enhanced_content.get('activity') else ''}
      
      <div class="summary-section">
        <h3>✨ Summary & Next Steps</h3>
        <p>{html.escape(enhanced_content.get('summary', ''))}</p>
      </div>
    </main>
  </div>
  
  <script>
  {scorm_js}
  </script>
</body>
</html>
"""
    return html_doc

def build_manifest_scorm12(title: str, org_id: str, sco_id: str, course_id: str, launch_file: str) -> str:
    # Minimal SCORM 1.2 manifest
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="{course_id}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 ims_xml.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <organizations default="{org_id}">
    <organization identifier="{org_id}" structure="hierarchical">
      <title>{html.escape(title)}</title>
      <item identifier="ITEM-{sco_id}" identifierref="{sco_id}" isvisible="true">
        <title>{html.escape(title)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="{sco_id}" type="webcontent" adlcp:scormtype="sco" href="{launch_file}">
      <file href="{launch_file}"/>
    </resource>
  </resources>
</manifest>
'''

def main():
    print("🚀 Starting Enhanced PDF to SCORM Conversion...")
    
    # 1) Extract text from PDF
    print("📄 Extracting text from PDF...")
    text = extract_pdf_text(PDF_INPUT)
    print(f"   ✓ Extracted {len(text)} characters")

    # 2) Enhance content with AI
    print("🤖 Enhancing content with OpenAI...")
    try:
        enhanced_content = enhance_content_with_ai(text, PACKAGE_TITLE)
        print(f"   ✓ Generated {len(enhanced_content.get('sections', []))} sections")
        print(f"   ✓ Created {len(enhanced_content.get('quiz', []))} quiz questions")
        print(f"   ✓ Added {len(enhanced_content.get('learning_objectives', []))} learning objectives")
    except Exception as e:
        print(f"   ⚠ AI enhancement failed: {e}")
        print("   ℹ Using fallback content structure")
        enhanced_content = {
            "introduction": f"Welcome to {PACKAGE_TITLE}",
            "learning_objectives": ["Understand core concepts", "Apply knowledge practically"],
            "sections": [{"title": "Content", "content": text}],
            "quiz": [],
            "activity": {"title": "Practice Exercise", "description": "Apply what you've learned."},
            "summary": "Review the key concepts covered in this lesson."
        }

    # 3) Create enhanced index.html
    print("🎨 Building beautiful HTML interface...")
    html_content = build_enhanced_html(enhanced_content, PACKAGE_TITLE)
    with open(LAUNCH_FILE, 'w', encoding='utf-8') as f:
        f.write(html_content)
    print("   ✓ Created interactive learning module")

    # 4) Create imsmanifest.xml
    print("📋 Creating SCORM manifest...")
    manifest = build_manifest_scorm12(PACKAGE_TITLE, ORG_IDENTIFIER, SCO_IDENTIFIER, COURSE_IDENTIFIER, LAUNCH_FILE)
    with open('pdf_to_scorm/imsmanifest.xml', 'w', encoding='utf-8') as f:
        f.write(manifest)
    print("   ✓ SCORM 1.2 manifest created")

    # 5) Zip into a SCORM package
    print("📦 Creating SCORM package...")
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write('pdf_to_scorm/imsmanifest.xml', 'imsmanifest.xml')
        zipf.write(LAUNCH_FILE, 'index.html')
    
    print("🎉 SCORM package created successfully!")
    print(f"   📁 Package: {OUTPUT_ZIP}")
    print(f"   🌐 Preview: Open {LAUNCH_FILE} in browser")
    print("   🎯 Features: Interactive quizzes, progress tracking, modern UI")

if __name__ == "__main__":
    main()