import os
import zipfile
from pathlib import Path
import PyPDF2
import html
import re
import time

# ------------ CONFIG ------------
PDF_INPUT = './pdf_to_scorm/Lesson Plan 2 - Argument Construction.docx.pdf'
PACKAGE_TITLE = 'Lesson Plan 2 - Argument Construction'
SCO_IDENTIFIER = 'SCO-1'
ORG_IDENTIFIER = 'ORG-1'
COURSE_IDENTIFIER = 'COURSE-ARG-CONSTRUCT'
OUTPUT_ZIP = 'pdf_to_scorm/scorm_package.zip'
LAUNCH_FILE = 'pdf_to_scorm/index.html'  # main SCO launch page
SCORM_VERSION = '1.2'  # '1.2' or '2004'
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

def build_html(content_text: str, title: str) -> str:
    # Escape HTML special chars, then convert double newlines to paragraphs
    escaped = html.escape(content_text)
    paragraphs = ''.join(f'<p>{p}</p>' for p in escaped.split('\n\n') if p.strip())

    # Minimal SCORM API wrapper for 1.2
    scorm_js = """
    ;(function(){
      // Minimal SCORM 1.2 API adapter
      var API = null;
      function findAPI(win) {
        var n = 0;
        while (win && !win.API && win.parent && win.parent !== win && n < 500) {
          n++; win = win.parent;
        }
        return win.API || null;
      }
      function init() {
        try {
          API = findAPI(window) || (window.opener && findAPI(window.opener)) || null;
          if (!API) return;
          // Initialize session
          try { API.LMSInitialize(""); } catch(e){}
          // Set status to completed if not already set
          try {
            var status = API.LMSGetValue("cmi.core.lesson_status");
            if (!status || status === "not attempted" || status === "unknown" ) {
              API.LMSSetValue("cmi.core.lesson_status","completed");
            }
            API.LMSCommit("");
          } catch(e){}
          // Handle unload
          window.addEventListener("beforeunload", function(){
            try { API && API.LMSFinish(""); } catch(e){}
          });
        } catch(e){}
      }
      if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 0);
      } else {
        document.addEventListener("DOMContentLoaded", init);
      }
    })();
    """

    # Responsive, clean HTML
    html_doc = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{html.escape(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {{
      --bg: #ffffff;
      --fg: #1a1a1a;
      --muted: #666;
      --accent: #0b6efd;
      --maxw: 820px;
    }}
    * {{ box-sizing: border-box; }}
    html, body {{ height: 100%; }}
    body {{
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      color: var(--fg);
      background: var(--bg);
      line-height: 1.6;
    }}
    header {{
      position: sticky;
      top: 0;
      background: white;
      border-bottom: 1px solid #eee;
      padding: 12px 16px;
      z-index: 10;
    }}
    header h1 {{
      margin: 0;
      font-size: clamp(18px, 3.5vw, 24px);
    }}
    main {{
      max-width: var(--maxw);
      margin: 0 auto;
      padding: 16px;
    }}
    article p {{
      margin: 0 0 1em 0;
      white-space: pre-wrap;
    }}
    .meta {{
      color: var(--muted);
      font-size: 0.9em;
      margin-bottom: 1rem;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --bg: #0f1115;
        --fg: #e6e6e6;
        --muted: #aaa;
        --accent: #4da3ff;
      }}
      header {{ background: #0f1115; border-color: #222; }}
    }}
  </style>
</head>
<body>
  <header>
    <h1>{html.escape(title)}</h1>
  </header>
  <main>
    <div class="meta">Automatically converted from PDF • Generated {time.strftime("%Y-%m-%d %H:%M")}</div>
    <article>
      {paragraphs if paragraphs.strip() else "<p>(No text extracted.)</p>"}
    </article>
  </main>
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
    # 1) Extract text from PDF
    text = extract_pdf_text(PDF_INPUT)

    # 2) Create index.html
    html_content = build_html(text, PACKAGE_TITLE)
    with open(LAUNCH_FILE, 'w', encoding='utf-8') as f:
        f.write(html_content)

    # 3) Create imsmanifest.xml
    manifest = build_manifest_scorm12(PACKAGE_TITLE, ORG_IDENTIFIER, SCO_IDENTIFIER, COURSE_IDENTIFIER, LAUNCH_FILE)
    with open('pdf_to_scorm/imsmanifest.xml', 'w', encoding='utf-8') as f:
        f.write(manifest)

    # 4) Zip into a SCORM package
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', zipfile.ZIP_DEFLATED) as zipf:
        zipf.write('pdf_to_scorm/imsmanifest.xml')
        zipf.write(LAUNCH_FILE)
    print(f"SCORM package created: {OUTPUT_ZIP}")

if __name__ == "__main__":
    main()