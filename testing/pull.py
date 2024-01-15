import os

print("Do you want to update the local repository? (y/n)")
choice = input()
if choice.lower() != "y":
    exit()

print("Pulling from GitHub...")
os.chdir("..")
os.system("git pull origin main")