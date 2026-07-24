@echo off
chcp 65001 >nul
cls

echo ===================================================
echo       VERIFICATION DES ENVIRONNEMENTS (SETUP)
echo ===================================================
echo.

echo -------------------------------------------------------------------------
echo 1. Gestion de Python
echo -------------------------------------------------------------------------

echo [1/4] Vérification de Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo -^> Python n'est pas détecté. Installation via winget...
    winget install Python.Python.3.11 --silent --accept-source-agreements --accept-package-agreements
    
    python --version >nul 2>&1
    if %errorlevel% neq 0 (
        echo -^> AVERTISSEMENT : Python vient d'être installé. Vous devrez peut-être redémarrer votre invite de commandes pour l'utiliser.
    ) else (
        echo -^> Python a été installé avec succès.
    )
) else (
    echo -^> Python est déjà installé.
)
echo.

echo -------------------------------------------------------------------------
echo 2. Installation des dépendances Python (requirements.txt)
echo -------------------------------------------------------------------------
echo [2/4] Vérification des dépendances Python...
if exist "requirements.txt" (
    python --version >nul 2>&1
    if %errorlevel% equ 0 (
        echo -^> Lancement de 'pip install -r requirements.txt'...
        python -m pip install --upgrade pip
        python -m pip install -r requirements.txt
        echo -^> Dépendances Python installées.
    ) else (
        echo -^> Impossible d'installer les dépendances : Python introuvable dans le PATH actuel.
    )
) else (
    echo -^> Aucun fichier 'requirements.txt' trouvé. Étape ignorée.
)
echo.

echo -------------------------------------------------------------------------
echo 3. Gestion de Node.js
echo -------------------------------------------------------------------------

echo [3/4] Vérification de Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo -^> Node.js n'est pas détecté. Installation via winget...
    winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
    
    node -v >nul 2>&1
    if %errorlevel% neq 0 (
        echo -^> AVERTISSEMENT : Node.js vient d'être installé. Vous devrez peut-être redémarrer votre invite de commandes pour l'utiliser.
    ) else (
        echo -^> Node.js a été installé avec succès.
    )
) else (
    echo -^> Node.js est déjà installé.
)
echo.

echo -------------------------------------------------------------------------
echo 4. Installation des packages Node.js (package.json)
echo -------------------------------------------------------------------------

echo [4/4] Vérification des packages Node.js...
if exist "package.json" (
    where npm >nul 2>&1
    if %errorlevel% equ 0 (
        echo -^> Lancement de 'npm install'...
        npm install
        timeout /t 3 >nul
        npm audit fix
        echo -^> Packages Node.js installés.
    ) else (
        echo -^> Impossible d'installer les packages : npm introuvable dans le PATH actuel.
    )
) else (
    echo -^> Aucun fichier 'package.json' trouvé. Étape ignorée.
)
echo.