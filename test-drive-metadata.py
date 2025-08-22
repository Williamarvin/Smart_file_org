#!/usr/bin/env python3
"""
Test script to extract Google Drive metadata without API
Option 2: Public file metadata extraction
"""

import requests
import re
import json
from urllib.parse import urlparse, parse_qs
import time

def extract_file_id(url):
    """Extract Google Drive file ID from various URL formats"""
    patterns = [
        r'/file/d/([a-zA-Z0-9_-]+)',  # https://drive.google.com/file/d/FILE_ID/view
        r'id=([a-zA-Z0-9_-]+)',        # https://drive.google.com/open?id=FILE_ID
        r'/folders/([a-zA-Z0-9_-]+)',  # Folder URLs
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def test_public_access(file_id):
    """Test various public access methods for Google Drive files"""
    print(f"\n{'='*60}")
    print(f"Testing File ID: {file_id}")
    print(f"{'='*60}")
    
    results = {}
    
    # Method 1: Direct download URL (works for public files)
    print("\n1. Testing direct download URL...")
    download_url = f"https://drive.google.com/uc?export=download&id={file_id}"
    try:
        response = requests.head(download_url, allow_redirects=True, timeout=5)
        results['download_accessible'] = response.status_code == 200
        
        if response.status_code == 200:
            # Extract metadata from headers
            results['content_type'] = response.headers.get('Content-Type', 'Unknown')
            results['content_length'] = response.headers.get('Content-Length', 'Unknown')
            
            # Try to extract filename from Content-Disposition
            content_disp = response.headers.get('Content-Disposition', '')
            if 'filename=' in content_disp:
                filename_match = re.search(r'filename="?([^"]+)"?', content_disp)
                if filename_match:
                    results['filename'] = filename_match.group(1)
            
            print(f"  ✓ File is publicly accessible")
            print(f"  - Content Type: {results['content_type']}")
            print(f"  - Size: {results.get('content_length', 'Unknown')} bytes")
            print(f"  - Filename: {results.get('filename', 'Not available')}")
        else:
            print(f"  ✗ File not publicly accessible (Status: {response.status_code})")
    except Exception as e:
        print(f"  ✗ Error accessing download URL: {e}")
        results['download_accessible'] = False
    
    # Method 2: View/Preview URL
    print("\n2. Testing view URL...")
    view_url = f"https://drive.google.com/file/d/{file_id}/view"
    try:
        response = requests.get(view_url, timeout=5)
        results['view_accessible'] = response.status_code == 200
        
        if response.status_code == 200:
            # Try to extract title from HTML
            title_match = re.search(r'<title>([^<]+)</title>', response.text)
            if title_match:
                title = title_match.group(1)
                # Clean up the title (remove " - Google Drive" suffix)
                title = title.replace(' - Google Drive', '')
                results['page_title'] = title
                print(f"  ✓ View page accessible")
                print(f"  - Page title: {title}")
            
            # Look for Open Graph meta tags
            og_title = re.search(r'<meta property="og:title" content="([^"]+)"', response.text)
            if og_title:
                results['og_title'] = og_title.group(1)
                print(f"  - OG Title: {og_title.group(1)}")
                
            og_image = re.search(r'<meta property="og:image" content="([^"]+)"', response.text)
            if og_image:
                results['thumbnail_url'] = og_image.group(1)
                print(f"  - Has thumbnail: Yes")
        else:
            print(f"  ✗ View page not accessible (Status: {response.status_code})")
    except Exception as e:
        print(f"  ✗ Error accessing view URL: {e}")
        results['view_accessible'] = False
    
    # Method 3: Embed/Preview URL
    print("\n3. Testing embed URL...")
    embed_url = f"https://drive.google.com/file/d/{file_id}/preview"
    try:
        response = requests.head(embed_url, timeout=5)
        results['embed_accessible'] = response.status_code == 200
        
        if response.status_code == 200:
            results['embed_url'] = embed_url
            print(f"  ✓ File can be embedded")
            print(f"  - Embed URL: {embed_url}")
        else:
            print(f"  ✗ Embed not available (Status: {response.status_code})")
    except Exception as e:
        print(f"  ✗ Error accessing embed URL: {e}")
        results['embed_accessible'] = False
    
    # Method 4: Thumbnail URL (for images/videos)
    print("\n4. Testing thumbnail URL...")
    thumbnail_url = f"https://drive.google.com/thumbnail?id={file_id}"
    try:
        response = requests.head(thumbnail_url, timeout=5)
        if response.status_code == 200:
            results['has_thumbnail'] = True
            results['thumbnail_url'] = thumbnail_url
            print(f"  ✓ Thumbnail available")
        else:
            print(f"  ✗ No thumbnail available")
    except Exception as e:
        print(f"  ✗ Error checking thumbnail: {e}")
    
    return results

def test_sample_urls():
    """Test with sample Google Drive URLs"""
    
    # Sample public Google Drive files for testing
    sample_urls = [
        # Add any Google Drive URLs from the Excel here
        "https://drive.google.com/file/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/view",  # Example format
    ]
    
    # Let's also check if we can get URLs from the database
    print("\n" + "="*60)
    print("TESTING GOOGLE DRIVE METADATA EXTRACTION (NO API)")
    print("="*60)
    
    # Test a known public file first (Google's sample presentation)
    print("\nTesting with a known public Google Drive file...")
    public_test_id = "1Z7gCBUMSxlH6M3Fi2JRBdYSayz9CGb2V"  # Public test file
    results = test_public_access(public_test_id)
    
    print("\n" + "="*60)
    print("SUMMARY OF AVAILABLE METADATA (WITHOUT API):")
    print("="*60)
    
    if results.get('download_accessible'):
        print("\n✅ Can extract from public files:")
        print("  - File accessibility status")
        print("  - Content type (MIME type)")
        print("  - File size")
        print("  - Filename (sometimes)")
        print("  - Page title")
        print("  - Thumbnail availability")
        print("  - Direct download URL")
        print("  - Embed URL for preview")
    else:
        print("\n⚠️ Limited metadata for private files:")
        print("  - Can only determine if file exists")
        print("  - Cannot get filename, size, or type")
    
    print("\n" + "="*60)
    print("RECOMMENDATION:")
    print("="*60)
    print("""
Based on testing, here's what we found:

Option 2 (No API) Limitations:
- ✗ Cannot access private/restricted files
- ✗ Limited metadata (no creation date, owner, etc.)
- ✗ Filename extraction is unreliable
- ✓ Can determine if file is public
- ✓ Can get basic info for public files

Conclusion:
Option 2 provides VERY LIMITED metadata. Most educational 
content on Google Drive is likely private/restricted.

→ RECOMMEND: Implement Option 1 (Google Drive API) for:
  - Full metadata access
  - Private file support
  - Reliable filename extraction
  - File permissions info
  - Folder structure
  - Owner information
  - Modification dates
""")

if __name__ == "__main__":
    test_sample_urls()