document.addEventListener('DOMContentLoaded', () => {
    fetch('/movies')
        .then(response => response.json())
        .then(movies => {
            const movieGrid = document.getElementById('movieGrid');
            const fullscreenVideo = document.getElementById('fullscreenVideo');
            const videoPlayer = document.getElementById('videoPlayer');
            const returnButton = document.getElementById('returnButton');

            movies.forEach(movie => {
                const movieItem = document.createElement('div');
                movieItem.classList.add('movie-item');

                const movieThumbnail = document.createElement('img');
                const thumbnailPath = `/Media/movies/src/${movie.name.replace(/\.[^/.]+$/, '')}.jpg`;
                fetch(thumbnailPath, { method: 'HEAD' })
                    .then(response => {
                        if (response.ok) {
                            movieThumbnail.src = thumbnailPath;
                            movieItem.appendChild(movieThumbnail);
                        } else {
                            movieThumbnail.style.display = 'none';
                            const blackRect = document.createElement('div');
                            blackRect.classList.add('black-rectangle');
                            blackRect.addEventListener('click', () => {
                                videoPlayer.src = `/Media/movies/${movie.name}`;
                                fullscreenVideo.style.display = 'flex';
                                videoPlayer.play();
                            });
                            movieItem.appendChild(blackRect);
                        }
                        const movieTitle = document.createElement('div');
                        movieTitle.classList.add('movie-title');
                        movieTitle.textContent = movie.name.replace(/_/g, ' ').replace(/\.[^/.]+$/, '');
                        movieItem.appendChild(movieTitle);
                    });

                movieThumbnail.alt = movie.name;
                movieThumbnail.addEventListener('click', () => {
                    videoPlayer.src = `/Media/movies/${movie.name}`;
                    fullscreenVideo.style.display = 'flex';
                    videoPlayer.play();
                });

                movieGrid.appendChild(movieItem);
            });

            returnButton.addEventListener('click', () => {
                fullscreenVideo.style.display = 'none';
                videoPlayer.pause();
                videoPlayer.src = '';
            });
        });
});
