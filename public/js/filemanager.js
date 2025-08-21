document.addEventListener('DOMContentLoaded', () => {
    const fileManager = document.getElementById('file-manager');
    const backButton = document.getElementById('back-button');
    const currentPathDisplay = document.getElementById('current-path');
    let currentPath = '';
    let moveMode = false;
    let selectedItems = [];
    let destinationSelectionMode = false;
    let itemsToMove = [];

    function fetchFiles(path = '') {
        fetch(`/files?path=${path}`)
            .then(response => response.json())
            .then(data => {
                fileManager.innerHTML = '';
                
                // Ajouter les contrôles de déplacement
                const moveControls = document.createElement('div');
                moveControls.className = 'move-controls';
                
                if (destinationSelectionMode) {
                    moveControls.innerHTML = `
                        <button id="cancel-destination-selection">Annuler la sélection de destination</button>
                        <span class="selected-count">Sélectionnez un dossier de destination pour ${itemsToMove.length} élément(s)</span>
                    `;
                } else {
                    moveControls.innerHTML = `
                        <button id="toggle-move-mode">${moveMode ? 'Annuler le déplacement' : 'Mode déplacement'}</button>
                        ${moveMode ? '<button id="move-to-parent">Déplacer vers dossier supérieur</button>' : ''}
                        ${moveMode && selectedItems.length > 0 ? '<button id="move-to-selected-folder">Déplacer vers dossier sélectionné</button>' : ''}
                        ${moveMode && selectedItems.length > 0 ? `<span class="selected-count">${selectedItems.length} élément(s) sélectionné(s)</span>` : ''}
                    `;
                }
                fileManager.appendChild(moveControls);
                
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
                    fileItem.setAttribute('data-is-directory', item.isDirectory);
                    
                    // Ajouter une classe si l'élément est sélectionné
                    if (selectedItems.some(selected => selected.path === item.path)) {
                        fileItem.classList.add('selected');
                    }

                    const fileName = document.createElement('span');
                    fileName.className = 'file-name';
                    fileName.textContent = item.isDirectory ? `${item.name}/` : item.name;
                    
                    fileName.addEventListener('click', () => {
                        if (destinationSelectionMode) {
                            // En mode sélection de destination, seuls les dossiers peuvent être sélectionnés
                            if (item.isDirectory) {
                                moveItemsToDestination(item.path);
                            } else {
                                alert('Veuillez sélectionner un dossier comme destination');
                            }
                        } else if (moveMode) {
                            // En mode déplacement, sélectionner/désélectionner l'élément
                            toggleSelection(item, fileItem);
                        } else if (item.isDirectory) {
                            // Navigation normale
                            currentPath = path ? `${path}/${item.name}` : item.name;
                            fetchFiles(currentPath);
                        }
                    });

                    const fileActions = document.createElement('div');
                    fileActions.className = 'file-actions';
                    fileActions.style.display = (moveMode || destinationSelectionMode) ? 'none' : 'block';

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Supprimer';
                    deleteButton.addEventListener('click', () => {
                        if (confirm(`Êtes-vous sûr de vouloir supprimer ${item.name} ?`)) {
                            deleteFile(item.path);
                        }
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

                // Ajouter les event listeners pour les contrôles de déplacement
                setupMoveControls();
            });
    }

    function setupMoveControls() {
        const toggleMoveButton = document.getElementById('toggle-move-mode');
        const moveToParentButton = document.getElementById('move-to-parent');
        const moveToSelectedFolderButton = document.getElementById('move-to-selected-folder');
        const cancelDestinationButton = document.getElementById('cancel-destination-selection');
        
        if (toggleMoveButton) {
            toggleMoveButton.addEventListener('click', () => {
                moveMode = !moveMode;
                if (!moveMode) {
                    selectedItems = [];
                    destinationSelectionMode = false;
                    itemsToMove = [];
                }
                fetchFiles(currentPath);
            });
        }
        
        if (moveToParentButton) {
            moveToParentButton.addEventListener('click', () => {
                const parentPath = getParentPath(currentPath);
                moveSelectedItems(parentPath);
            });
        }
        
        if (moveToSelectedFolderButton) {
            moveToSelectedFolderButton.addEventListener('click', () => {
                if (selectedItems.length === 0) {
                    alert('Aucun élément sélectionné');
                    return;
                }
                // Passer en mode sélection de destination
                itemsToMove = [...selectedItems];
                selectedItems = [];
                destinationSelectionMode = true;
                moveMode = false;
                fetchFiles(currentPath);
            });
        }
        
        if (cancelDestinationButton) {
            cancelDestinationButton.addEventListener('click', () => {
                destinationSelectionMode = false;
                itemsToMove = [];
                moveMode = true;
                fetchFiles(currentPath);
            });
        }
    }

    function getParentPath(path) {
        if (!path) return '';
        const pathParts = path.split('/').filter(part => part);
        pathParts.pop();
        return pathParts.join('/');
    }

    function moveItemsToDestination(destinationPath) {
        if (itemsToMove.length === 0) {
            alert('Aucun élément à déplacer');
            return;
        }

        const promises = itemsToMove.map(item => {
            return fetch('/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sourcePath: item.path,
                    destinationPath: destinationPath
                })
            });
        });

        Promise.all(promises)
            .then(responses => {
                const failedMoves = responses.filter(response => !response.ok);
                if (failedMoves.length > 0) {
                    alert(`Erreur lors du déplacement de ${failedMoves.length} élément(s)`);
                } else {
                    alert(`${itemsToMove.length} élément(s) déplacé(s) avec succès vers ${destinationPath}`);
                }
                itemsToMove = [];
                destinationSelectionMode = false;
                fetchFiles(currentPath);
            })
            .catch(error => {
                console.error('Erreur lors du déplacement:', error);
                alert('Erreur lors du déplacement des fichiers');
            });
    }

    function toggleSelection(item, fileElement) {
        const index = selectedItems.findIndex(selected => selected.path === item.path);
        if (index > -1) {
            selectedItems.splice(index, 1);
            fileElement.classList.remove('selected');
        } else {
            selectedItems.push(item);
            fileElement.classList.add('selected');
        }
        fetchFiles(currentPath); // Rafraîchir pour mettre à jour le compteur
    }

    function moveSelectedItems(destinationPath) {
        if (selectedItems.length === 0) {
            alert('Aucun élément sélectionné');
            return;
        }

        const promises = selectedItems.map(item => {
            return fetch('/move', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sourcePath: item.path,
                    destinationPath: destinationPath
                })
            });
        });

        Promise.all(promises)
            .then(responses => {
                const failedMoves = responses.filter(response => !response.ok);
                if (failedMoves.length > 0) {
                    alert(`Erreur lors du déplacement de ${failedMoves.length} élément(s)`);
                } else {
                    alert(`${selectedItems.length} élément(s) déplacé(s) avec succès`);
                }
                selectedItems = [];
                moveMode = false;
                fetchFiles(currentPath);
            })
            .catch(error => {
                console.error('Erreur lors du déplacement:', error);
                alert('Erreur lors du déplacement des fichiers');
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
