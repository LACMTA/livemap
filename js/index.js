let showMini = false;

// Detect if the screen is a mobile device and start the legend minified
if(window.innerWidth <= 600) {
    showMini = true;
}

document.getElementById('legend-close').addEventListener('click', () => {
    showMini = true;
    adjustMiniDisplay();
});

document.getElementById('legend-mini').addEventListener('click', () => {
    showMini = false;
    adjustMiniDisplay();
});

function adjustMiniDisplay() {
    if (showMini) {
        document.getElementById('legend').style.display = 'none';
        document.getElementById('legend-mini').style.display = 'flex';
    } else {
        document.getElementById('legend').style.display = 'block';
        document.getElementById('legend-mini').style.display = 'none';
    }
}

window.addEventListener('resize', () => {
    var w = document.documentElement.clientWidth;
    var h = document.documentElement.clientHeight;

    if (w > 600) {
        showMini = false;
        adjustMiniDisplay();
    } else {
        showMini = true;
        adjustMiniDisplay();
    }
});

