import sys
import os

version = "1.4"
logmessage = f"""


-------------------- START OF EXECUTION LOG --------------------
ver.{version}
"""

# Check if we have the required arguments
if len(sys.argv) < 2:
    print("Error: No option provided")
    sys.exit(1)

option = sys.argv[1]
data_input = sys.argv[2] if len(sys.argv) > 2 else ""

print(logmessage)
print(f"Option: {option} --- Received by python")

if option == "magnet":
    if data_input and data_input != "undefined":
        print(f"magnet: {data_input}")
        
        # Create downloads directory
        downloads_dir = "Media/downloads/torrentInfo"
        os.makedirs(downloads_dir, exist_ok=True)
        
        # Save magnet link to file
        magnet_file = os.path.join(downloads_dir, "magnet_links.txt")
        with open(magnet_file, "a", encoding="utf-8") as f:
            f.write(f"{data_input}\n")
        
        print(f"Magnet link saved to {magnet_file}")
        # Download with magnet link











        # END OF MAGNET link processing
        print("Magnet link processed successfully")
    else:
        print("No valid magnet link received.")
        
elif option == "upload":
    if data_input and data_input != "undefined":
        # Get absolute path and filename
        file_path = os.path.abspath(data_input)
        print(f"fichier: {file_path}")
        
        # Verify it's a torrent file
        if file_path.lower().endswith('.torrent'):
            print("Torrent file detected and processed")
            # Download with torrent file








            # END OF TORRENT file processing
            print("Torrent file processed successfully")
        else:
            print("Warning: File doesn't appear to be a torrent file")
    else:
        print("File upload option selected but no file path provided")
        
elif option == "undefined" or not option:
    print("Error: No valid option selected")
else:
    print(f"Unknown option: {option}")

print("Done!")