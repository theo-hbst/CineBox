import sys
import os

option = sys.argv[1]
text_input = sys.argv[2]

print(f"Option: {option} --- Received by python")
print(f"Text Input: {text_input} --- Received by python")
os.system(f'mkdir {text_input}')