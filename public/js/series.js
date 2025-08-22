document.addEventListener('DOMContentLoaded', () => {
  const seriesManager = document.getElementById('series-manager');
  const backButton = document.getElementById('back-button');
  const currentPathDisplay = document.getElementById('current-path');
  const fullscreenVideo = document.getElementById('fullscreenVideo');
  const videoPlayer = document.getElementById('videoPlayer');
  const returnButton = document.getElementById('returnButton');
  let currentPath = 'series';

  function fetchSeriesFiles(path = '') {
    fetch(`/files?path=${path}`)
      .then(response => response.json())
      .then(data => {
        seriesManager.innerHTML = '';
        const backButtonContainer = document.createElement('div');
        backButtonContainer.id = 'back-button-container';
        backButtonContainer.appendChild(backButton);
        seriesManager.appendChild(backButtonContainer);

        if (path !== 'series') {
          backButton.style.display = 'inline-block';
        } else {
          backButton.style.display = 'none';
        }

        // Mettre à jour l'affichage du chemin actuel
        currentPathDisplay.textContent = `Emplacement: /${path.replace(/^series\/?/, '')}`;

        // Vérifier que data est un tableau avant d'appeler sort
        if (Array.isArray(data)) {
          // Filtrer les dossiers src
          data = data.filter(item => item.name !== 'src');

          // Si on est à la racine, ne montrer que les dossiers
          if (path === 'series') {
            data = data.filter(item => item.isDirectory);
          }

          // Trier les éléments pour que les dossiers apparaissent en premier
          data.sort((a, b) => b.isDirectory - a.isDirectory);

          const seriesGrid = document.createElement('div');
          seriesGrid.className = 'series-grid';

          if (data.length === 0) {
            // Centrage vertical et horizontal
            const msg = document.createElement('div');
            msg.style.color = '#fff';
            msg.style.display = 'flex';
            msg.style.justifyContent = 'center';
            msg.style.alignItems = 'center';
            msg.style.height = '60vh';
            msg.style.fontSize = '1.3rem';
            msg.textContent = path === 'series'
              ? 'Aucune série disponible.'
              : 'Aucun épisode disponible.';
            seriesManager.appendChild(msg);
            return;
          }

          data.forEach(item => {
            const fileItem = document.createElement('div');
            fileItem.className = item.isDirectory ? 'folder-item' : 'episode-item';

            if (item.isDirectory) {
              const fileName = document.createElement('div');
              fileName.className = 'folder-title';
              fileName.textContent = item.name.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
              fileName.addEventListener('click', () => {
                currentPath = path ? `${path}/${item.name}` : item.name;
                fetchSeriesFiles(currentPath);
              });
              fileItem.appendChild(fileName);
              seriesManager.appendChild(fileItem); // Ajouter directement les dossiers au gestionnaire
            } else {
              const thumbnailPath = `/${path}/src/${item.name.replace(/\.[^/.]+$/, '')}.jpg`;
              const mediaThumbnail = document.createElement('img');
              mediaThumbnail.alt = item.name;
              fetch(thumbnailPath, { method: 'HEAD' })
                .then(response => {
                  if (response.ok) {
                    mediaThumbnail.src = thumbnailPath;
                    fileItem.appendChild(mediaThumbnail);
                  } else {
                    mediaThumbnail.style.display = 'none';
                    const blackRect = document.createElement('div');
                    blackRect.className = 'black-rectangle';
                    blackRect.addEventListener('click', () => {
                      videoPlayer.src = `/${path}/${item.name}`;
                      fullscreenVideo.style.display = 'flex';
                      videoPlayer.play();
                    });
                    fileItem.appendChild(blackRect);
                  }
                });

              mediaThumbnail.addEventListener('click', () => {
                videoPlayer.src = `/${path}/${item.name}`;
                fullscreenVideo.style.display = 'flex';
                videoPlayer.play();
              });

              const fileName = document.createElement('div');
              fileName.className = 'episode-title';
              fileName.textContent = item.name.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
              fileItem.appendChild(fileName); // Ajouter le texte en bas du média

              seriesGrid.appendChild(fileItem); // Ajouter les épisodes à la grille
            }
          });

          seriesManager.appendChild(seriesGrid);
        } else {
          // Si data n'est pas un tableau, afficher un message d'erreur
          const msg = document.createElement('div');
          msg.style.color = '#fff';
          msg.style.display = 'flex';
          msg.style.justifyContent = 'center';
          msg.style.alignItems = 'center';
          msg.style.height = '60vh';
          msg.style.fontSize = '1.3rem';
          msg.textContent = 'Erreur lors du chargement des séries.';
          seriesManager.appendChild(msg);
        }
      });
  }

  backButton.addEventListener('click', () => {
    const pathParts = currentPath.split('/').filter(part => part);
    pathParts.pop();
    currentPath = pathParts.join('/');
    fetchSeriesFiles(currentPath);
  });

  returnButton.addEventListener('click', () => {
    fullscreenVideo.style.display = 'none';
    videoPlayer.pause();
    videoPlayer.src = '';
  });

  fetchSeriesFiles(currentPath);

  // Pour le refresh auto toutes les 15s
  setInterval(() => fetchSeriesFiles(currentPath), 15000);
});
