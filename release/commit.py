import os

print("Do you want to commit and push to GitHub? (y/n)")
choice = input()
if choice.lower() != "y":
    exit()

print("Enter commit message: ")
message = input()

os.chdir("..")
os.system("git add .")
os.system(f"git commit -m \"{message}\"")
os.system("git push -u origin main")
