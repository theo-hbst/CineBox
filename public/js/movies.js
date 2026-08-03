document.addEventListener('DOMContentLoaded', () => {
    fetch('/movies')
        .then(response => response.json())
        .then(movies => {
            const movieGrid = document.getElementById('movieGrid');
            const fullscreenVideo = document.getElementById('fullscreenVideo');
            const videoPlayer = document.getElementById('videoPlayer');
            const returnButton = document.getElementById('returnButton');

            movieGrid.innerHTML = '';
            if (!movies || movies.length === 0) {
                const msg = document.createElement('div');
                msg.classList.add('adaptive-page-text');
                msg.style.display = 'flex';
                msg.style.justifyContent = 'center';
                msg.style.alignItems = 'center';
                msg.style.height = 'calc(100vh - 200px)';
                msg.style.width = '100%';
                msg.style.fontSize = '1.3rem';
                msg.textContent = 'No movie available.';
                movieGrid.style.display = 'flex';
                movieGrid.style.justifyContent = 'center';
                movieGrid.style.alignItems = 'center';
                movieGrid.style.height = 'calc(100vh - 200px)';
                movieGrid.appendChild(msg);
                return;
            }

            movies.forEach(movie => {
                const movieItem = document.createElement('div');
                movieItem.classList.add('movie-item');

                const movieThumbnail = document.createElement('img');
                const movieTitle = document.createElement('div');
                movieTitle.classList.add('movie-title', 'adaptive-page-text');
                movieTitle.textContent = movie.name.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');

                if (movie.thumbnail) {
                    movieThumbnail.src = movie.thumbnail;
                    movieThumbnail.alt = movie.name;
                    movieThumbnail.addEventListener('click', () => {
                        videoPlayer.src = movie.videoUrl;
                        fullscreenVideo.style.display = 'flex';
                        videoPlayer.play();
                    });
                    movieItem.appendChild(movieThumbnail);
                } else {
                    movieThumbnail.style.display = 'none';
                    const blackRect = document.createElement('div');
                    blackRect.classList.add('black-rectangle');
                    blackRect.addEventListener('click', () => {
                        videoPlayer.src = movie.videoUrl;
                        fullscreenVideo.style.display = 'flex';
                        videoPlayer.play();
                    });
                    movieItem.appendChild(blackRect);
                }

                movieItem.appendChild(movieTitle);

                movieGrid.appendChild(movieItem);
            });

            returnButton.addEventListener('click', () => {
                fullscreenVideo.style.display = 'none';
                videoPlayer.pause();
                videoPlayer.src = '';
            });
        });
});
