import os
import cairosvg
from PIL import Image

# Set directory containing SVGs
input_dir = "patterns"  # Change this to your actual SVG folder
output_dir = "patterns/webp"  # Change to desired output folder

# Ensure output directory exists
os.makedirs(output_dir, exist_ok=True)

# Convert each SVG file
for filename in os.listdir(input_dir):
    if filename.endswith(".svg"):
        svg_path = os.path.join(input_dir, filename)
        png_path = os.path.join(output_dir, filename.replace(".svg", ".png"))
        webp_path = os.path.join(output_dir, filename.replace(".svg", ".webp"))

        print(f"Converting: {filename}...")

        # Convert SVG to PNG
        cairosvg.svg2png(url=svg_path, write_to=png_path)

        # Convert PNG to WebP
        with Image.open(png_path) as img:
            img.save(webp_path, "WEBP", lossless=True)

        # Remove temporary PNG file
        os.remove(png_path)

        print(f"Saved: {webp_path}")

print("Conversion complete! 🎨✨")