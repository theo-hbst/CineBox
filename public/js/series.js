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

        // Update the current path display
        currentPathDisplay.textContent = `Location: /${path.replace(/^series\/?/, '')}`;

        // Check that data is an array before calling sort
        if (Array.isArray(data)) {
          // Filter out src folders
          data = data.filter(item => item.name !== 'src');

          // If we're at the root, only show folders
          if (path === 'series') {
            data = data.filter(item => item.isDirectory);
          }

          // Sort items so folders appear first
          data.sort((a, b) => b.isDirectory - a.isDirectory);

          const seriesGrid = document.createElement('div');
          seriesGrid.className = 'series-grid';

          if (data.length === 0) {
            // Vertical and horizontal centering
            const msg = document.createElement('div');
            msg.classList.add('adaptive-page-text');
            msg.style.display = 'flex';
            msg.style.justifyContent = 'center';
            msg.style.alignItems = 'center';
            msg.style.height = '60vh';
            msg.style.fontSize = '1.3rem';
            msg.textContent = path === 'series'
              ? 'No series available.'
              : 'No episodes available.';
            seriesManager.appendChild(msg);
            return;
          }

          data.forEach(item => {
            const fileItem = document.createElement('div');
            fileItem.className = item.isDirectory ? 'folder-item' : 'episode-item';

            if (item.isDirectory) {
              const fileName = document.createElement('div');
              fileName.className = 'folder-title adaptive-page-text';
              fileName.textContent = item.name.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
              fileName.addEventListener('click', () => {
                currentPath = path ? `${path}/${item.name}` : item.name;
                fetchSeriesFiles(currentPath);
              });
              fileItem.appendChild(fileName);
              seriesManager.appendChild(fileItem); // Add folders directly to the manager
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
              fileName.className = 'episode-title adaptive-page-text';
              fileName.textContent = item.name.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
              fileItem.appendChild(fileName); // Add the caption below the media

              seriesGrid.appendChild(fileItem); // Add the episode to the grid
            }
          });

          seriesManager.appendChild(seriesGrid);
        } else {
          // If data isn't an array, show an error message
          const msg = document.createElement('div');
          msg.classList.add('adaptive-page-text');
          msg.style.display = 'flex';
          msg.style.justifyContent = 'center';
          msg.style.alignItems = 'center';
          msg.style.height = '60vh';
          msg.style.fontSize = '1.3rem';
          msg.textContent = 'Error loading series.';
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

  setInterval(() => fetchSeriesFiles(currentPath), 15000); // Auto-refresh every 15s
});
