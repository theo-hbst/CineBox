import sys
import os

version = "1.1"
logmessage = f"""


-------------------- START OF EXECUTION LOG --------------------
ver.{version}
"""

option = sys.argv[1]
text_input = sys.argv[2]

print(logmessage)

print(f"Option: {option} --- Received by python")
if text_input:
    print(f"Text Input: {text_input} --- Received by python")
    os.system(f'mkdir {text_input}')
else:
    print("No text input received. No command was executed.")
print("Done!")