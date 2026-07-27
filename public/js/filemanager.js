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

                // Add the move controls
                const moveControls = document.createElement('div');
                moveControls.className = 'move-controls';

                if (destinationSelectionMode) {
                    moveControls.innerHTML = `
                        <button id="cancel-destination-selection">Cancel destination selection</button>
                        <span class="selected-count">Select a destination folder for ${itemsToMove.length} item(s)</span>
                    `;
                } else {
                    moveControls.innerHTML = `
                        <button id="toggle-move-mode">${moveMode ? 'Cancel move' : 'Move mode'}</button>
                        ${moveMode ? '<button id="move-to-parent">Move to parent folder</button>' : ''}
                        ${moveMode && selectedItems.length > 0 ? '<button id="move-to-selected-folder">Move to selected folder</button>' : ''}
                        ${moveMode && selectedItems.length > 0 ? `<span class="selected-count">${selectedItems.length} item(s) selected</span>` : ''}
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

                // Update the current path display
                currentPathDisplay.textContent = `Location: /${path}`;

                // Sort items so folders appear first
                data.sort((a, b) => b.isDirectory - a.isDirectory);

                data.forEach(item => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.setAttribute('data-is-directory', item.isDirectory);

                    // Add a class if the item is selected
                    if (selectedItems.some(selected => selected.path === item.path)) {
                        fileItem.classList.add('selected');
                    }

                    const fileName = document.createElement('span');
                    fileName.className = 'file-name';
                    fileName.textContent = item.isDirectory ? `${item.name}/` : item.name;

                    fileName.addEventListener('click', () => {
                        if (destinationSelectionMode) {
                            // In destination selection mode, only folders can be selected
                            if (item.isDirectory) {
                                moveItemsToDestination(item.path);
                            } else {
                                alert('Please select a folder as the destination');
                            }
                        } else if (moveMode) {
                            // In move mode, select/deselect the item
                            toggleSelection(item, fileItem);
                        } else if (item.isDirectory) {
                            // Regular navigation
                            currentPath = path ? `${path}/${item.name}` : item.name;
                            fetchFiles(currentPath);
                        }
                    });

                    const fileActions = document.createElement('div');
                    fileActions.className = 'file-actions';
                    fileActions.style.display = (moveMode || destinationSelectionMode) ? 'none' : 'block';

                    const deleteButton = document.createElement('button');
                    deleteButton.textContent = 'Delete';
                    deleteButton.addEventListener('click', () => {
                        if (confirm(`Are you sure you want to delete ${item.name}?`)) {
                            deleteFile(item.path);
                        }
                    });

                    const renameButton = document.createElement('button');
                    renameButton.textContent = 'Rename';
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
                        downloadButton.textContent = 'Download';
                        downloadButton.addEventListener('click', () => {
                            downloadFile(item.path);
                        });
                        fileActions.appendChild(downloadButton);
                    }

                    fileItem.appendChild(fileName);
                    fileItem.appendChild(fileActions);
                    fileManager.appendChild(fileItem);
                });

                // Add the event listeners for the move controls
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
                    alert('No item selected');
                    return;
                }
                // Switch to destination selection mode
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
            alert('No item to move');
            return;
        }

        const promises = itemsToMove.map(item => {
            return csrfFetch('/move', {
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
                    alert(`Error moving ${failedMoves.length} item(s)`);
                } else {
                    alert(`${itemsToMove.length} item(s) successfully moved to ${destinationPath}`);
                }
                itemsToMove = [];
                destinationSelectionMode = false;
                fetchFiles(currentPath);
            })
            .catch(error => {
                console.error('Error moving items:', error);
                alert('Error moving files');
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
        fetchFiles(currentPath); // Refresh to update the counter
    }

    function moveSelectedItems(destinationPath) {
        if (selectedItems.length === 0) {
            alert('No item selected');
            return;
        }

        const promises = selectedItems.map(item => {
            return csrfFetch('/move', {
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
                    alert(`Error moving ${failedMoves.length} item(s)`);
                } else {
                    alert(`${selectedItems.length} item(s) successfully moved`);
                }
                selectedItems = [];
                moveMode = false;
                fetchFiles(currentPath);
            })
            .catch(error => {
                console.error('Error moving items:', error);
                alert('Error moving files');
            });
    }

    function deleteFile(path) {
        csrfFetch(`/delete?path=${path}`, { method: 'DELETE' })
            .then(() => fetchFiles(currentPath));
    }

    function renameFile(oldPath, newPath) {
        csrfFetch(`/rename?oldPath=${oldPath}&newPath=${newPath}`, { method: 'POST' })
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
