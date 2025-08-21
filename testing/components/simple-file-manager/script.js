document.addEventListener('DOMContentLoaded', () => {
    const fileManager = document.getElementById('file-manager');
    const backButton = document.getElementById('back-button');
    const currentPathDisplay = document.getElementById('current-path');
    let currentPath = '';

    function fetchFiles(path = '') {
        fetch(`/files?path=${path}`)
            .then(response => response.json())
            .then(data => {
                fileManager.innerHTML = '';
                const backButtonContainer = document.createElement('div');
                backButtonContainer.id = 'back-button-container';
                backButtonContainer.appendChild(backButton);
                fileManager.appendChild(backButtonContainer);

                if (path) {
                    backButton.style.display = 'inline-block';
                } else {
                    backButton.style.display = 'none';
                }

                // Mettre à jour l'affichage du chemin actuel
                currentPathDisplay.textContent = `Emplacement: /${path}`;

                // Trier les éléments pour que les dossiers apparaissent en premier
                data.sort((a, b) => b.isDirectory - a.isDirectory);

                data.forEach(item => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';

                    const fileName = document.createElement('span');
                    fileName.className = 'file-name';
                    fileName.textContent = item.isDirectory ? `${item.name}/` : item.name;
                    fileName.addEventListener('click', () => {
                        if (item.isDirectory) {
                            currentPath = item.path;
                            fetchFiles(item.path);
                        }
                    });

                    const fileActions = document.createElement('div');
                    fileActions.className = 'file-actions';

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Supprimer';
                    deleteButton.addEventListener('click', () => {
                        deleteFile(item.path);
                    });

                    const renameButton = document.createElement('button');
                    renameButton.textContent = 'Renommer';
                    const renameInput = document.createElement('input');
                    renameInput.type = 'text';
                    renameInput.value = item.name;
                    renameButton.addEventListener('click', () => {
                        renameFile(item.path, renameInput.value);
                    });

                    fileActions.appendChild(deleteButton);
                    fileActions.appendChild(renameButton);
                    fileActions.appendChild(renameInput);

                    if (!item.isDirectory) {
                        const downloadButton = document.createElement('button');
                        downloadButton.textContent = 'Télécharger';
                        downloadButton.addEventListener('click', () => {
                            downloadFile(item.path);
                        });
                        fileActions.appendChild(downloadButton);
                    }

                    fileItem.appendChild(fileName);
                    fileItem.appendChild(fileActions);
                    fileManager.appendChild(fileItem);
                });
            });
    }

    function deleteFile(path) {
        fetch(`/delete?path=${path}`, { method: 'DELETE' })
            .then(() => fetchFiles(currentPath));
    }

    function renameFile(oldPath, newPath) {
        fetch(`/rename?oldPath=${oldPath}&newPath=${newPath}`, { method: 'POST' })
            .then(() => fetchFiles(currentPath));
    }

    function downloadFile(path) {
        window.location.href = `/download?path=${path}`;
    }

    backButton.addEventListener('click', () => {
        const pathParts = currentPath.split('/').filter(part => part);
        pathParts.pop();
        currentPath = pathParts.join('/');
        fetchFiles(currentPath);
    });

    fetchFiles();
});
