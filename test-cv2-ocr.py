#!/usr/bin/env python3

import cv2
import numpy as np
import pytesseract
from pdf2image import convert_from_path
import os
import sys

def preprocess_image_for_ocr(image):
    """
    Preprocess image using OpenCV for better OCR results
    """
    # Convert to grayscale
    gray = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Apply adaptive thresholding for better text extraction
    # This helps with scanned documents that may have uneven lighting
    thresh = cv2.adaptiveThreshold(blurred, 255, 
                                  cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                  cv2.THRESH_BINARY, 11, 2)
    
    # Denoise
    denoised = cv2.fastNlMeansDenoising(thresh, None, 10, 7, 21)
    
    # Optional: Apply morphological operations to clean up the image
    kernel = np.ones((1, 1), np.uint8)
    cleaned = cv2.morphologyEx(denoised, cv2.MORPH_CLOSE, kernel)
    
    return cleaned

def extract_text_with_cv2_ocr(pdf_path, max_pages=2):
    """
    Extract text from scanned PDF using cv2 and OCR
    """
    print("📷 Starting CV2 + OCR Text Extraction")
    print(f"Processing PDF: {pdf_path}\n")
    
    try:
        # Convert PDF to images
        print("Step 1: Converting PDF pages to images...")
        
        # Use pdf2image to convert PDF pages
        # Lower DPI for faster processing during testing
        images = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=max_pages)
        
        print(f"✅ Converted {len(images)} pages to images\n")
        
        all_text = []
        
        for i, image in enumerate(images, 1):
            print(f"Step 2.{i}: Processing page {i}/{len(images)}...")
            
            # Save original image for debugging
            temp_original = f"/tmp/page_{i}_original.png"
            image.save(temp_original)
            print(f"  - Saved original: {temp_original}")
            
            # Preprocess image with OpenCV
            print(f"  - Applying CV2 preprocessing...")
            processed_image = preprocess_image_for_ocr(image)
            
            # Save processed image for debugging
            temp_processed = f"/tmp/page_{i}_processed.png"
            cv2.imwrite(temp_processed, processed_image)
            print(f"  - Saved processed: {temp_processed}")
            
            # Apply OCR with pytesseract
            print(f"  - Running Tesseract OCR...")
            
            # Configure pytesseract for better accuracy
            custom_config = r'--oem 3 --psm 6'
            
            # Extract text from the processed image
            text = pytesseract.image_to_string(processed_image, config=custom_config)
            
            if text and text.strip():
                print(f"  ✅ Extracted {len(text)} characters from page {i}")
                all_text.append(f"\n--- Page {i} ---\n{text}")
            else:
                print(f"  ⚠️ No text detected on page {i}")
                # Try with original image as fallback
                print(f"  - Trying OCR on original image...")
                text = pytesseract.image_to_string(image, config=custom_config)
                if text and text.strip():
                    print(f"  ✅ Extracted {len(text)} characters from original image")
                    all_text.append(f"\n--- Page {i} (original) ---\n{text}")
            
            print()
        
        # Combine all extracted text
        full_text = "".join(all_text)
        
        if full_text:
            print("=" * 50)
            print("✅ OCR EXTRACTION COMPLETE!")
            print(f"Total characters extracted: {len(full_text)}")
            print("=" * 50)
            print("\nText preview (first 1000 characters):")
            print("-" * 50)
            print(full_text[:1000])
            print("-" * 50)
            
            # Save the full text
            output_file = "/tmp/cv2-ocr-result.txt"
            with open(output_file, "w", encoding="utf-8") as f:
                f.write(full_text)
            print(f"\n✅ Full text saved to: {output_file}")
            
            return full_text
        else:
            print("❌ No text could be extracted from the PDF")
            print("\nPossible reasons:")
            print("1. The PDF might be heavily compressed")
            print("2. The scan quality might be too low")
            print("3. The text might be in a non-standard font")
            print("4. The document might contain handwritten text")
            
            return None
            
    except Exception as e:
        print(f"❌ Error during processing: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        
        # Try to provide helpful error messages
        if "poppler" in str(e).lower():
            print("\n⚠️ PDF tools not available. Installing poppler-utils...")
            os.system("apt-get update && apt-get install -y poppler-utils")
            print("Please run the script again after installation.")
        elif "tesseract" in str(e).lower():
            print("\n⚠️ Tesseract not found. Installing tesseract-ocr...")
            os.system("apt-get update && apt-get install -y tesseract-ocr")
            print("Please run the script again after installation.")
        
        import traceback
        traceback.print_exc()
        return None

def main():
    pdf_path = "/tmp/debating-book.pdf"
    
    if not os.path.exists(pdf_path):
        print(f"❌ PDF not found at {pdf_path}")
        print("Please ensure the PDF file is in the correct location.")
        sys.exit(1)
    
    print("🚀 OpenCV + OCR Text Detection System")
    print("=" * 50)
    print(f"PDF file: {pdf_path}")
    print(f"File size: {os.path.getsize(pdf_path) / (1024*1024):.2f} MB")
    print("=" * 50)
    print()
    
    # Extract text with CV2 preprocessing
    extracted_text = extract_text_with_cv2_ocr(pdf_path, max_pages=2)
    
    if extracted_text:
        print("\n✅ SUCCESS! Text has been extracted from your scanned PDF.")
        print("The full text is available at: /tmp/cv2-ocr-result.txt")
    else:
        print("\n❌ Text extraction failed.")
        print("\nAlternative solutions:")
        print("1. Try with higher quality scan")
        print("2. Use Google Drive OCR (most reliable)")
        print("3. Use online OCR services")

if __name__ == "__main__":
    main()