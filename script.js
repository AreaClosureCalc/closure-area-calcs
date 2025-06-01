function dmsToRadians(dms) {
    let deg = Math.floor(dms);
    let min = Math.floor((dms - deg) * 100);
    let sec = (((dms - deg) * 100) - min) * 100;
    return (deg + min / 60 + sec / 3600) * Math.PI / 180;
}

function computePoints() {
    const rows = document.querySelectorAll("table tr.data-row");
    const points = [];
    let x = 0;
    let y = 0;
    points.push({ x, y });

    rows.forEach(row => {
        const type = row.querySelector("select").value;
        const bearing = parseFloat(row.cells[1].querySelector("input").value);
        const length = parseFloat(row.cells[2].querySelector("input").value);
        const radius = parseFloat(row.cells[3].querySelector("input").value);
        const dir = row.cells[4].querySelector("input").value.toUpperCase();

        if (type === "Straight") {
            const angle = dmsToRadians(bearing);
            x += length * Math.sin(angle);
            y += length * Math.cos(angle);
            points.push({ x, y });
        } else if (type === "Curve") {
            if (!radius || !length || isNaN(bearing)) return;

            const centralAngle = length / radius;
            const chordLength = 2 * radius * Math.sin(centralAngle / 2);
            const chordBearing = dir === "R"
                ? dmsToRadians(bearing) + centralAngle / 2
                : dmsToRadians(bearing) - centralAngle / 2;

            x += chordLength * Math.sin(chordBearing);
            y += chordLength * Math.cos(chordBearing);
            points.push({ x, y });
        }
    });

    return points;
}

function calculateArea(points) {
    let area = 0;
    for (let i = 0; i < points.length - 1; i++) {
        area += (points[i].x * points[i + 1].y) - (points[i + 1].x * points[i].y);
    }
    return Math.abs(area / 2);
}

function drawPolygon(points) {
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (points.length < 2) return;

    const padding = 50;
    const allX = points.map(p => p.x);
    const allY = points.map(p => p.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allX);
    const minY = Math.min(...allY);
    const maxY = Math.max(...allY);

    const scaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
    const scaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
    const scale = Math.min(scaleX, scaleY);

    const offsetX = padding - minX * scale;
    const offsetY = padding - minY * scale;

    ctx.beginPath();
    ctx.strokeStyle = "blue";
    ctx.fillStyle = "red";

    for (let i = 0; i < points.length; i++) {
        const px = points[i].x * scale + offsetX;
        const py = canvas.height - (points[i].y * scale + offsetY);

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }

    ctx.closePath();
    ctx.stroke();

    for (let i = 0; i < points.length; i++) {
        const px = points[i].x * scale + offsetX;
        const py = canvas.height - (points[i].y * scale + offsetY);
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, 2 * Math.PI);
        ctx.fill();
    }
}

document.getElementById("calculateBtn").addEventListener("click", () => {
    const points = computePoints();
    const start = points[0];
    const end = points[points.length - 1];
    const closureError = Math.hypot(end.x - start.x, end.y - start.y);
    const area = calculateArea(points);
    document.getElementById("result").innerText = `Closure error: ${closureError.toFixed(3)} m\nArea: ${area.toFixed(3)} m²`;
    drawPolygon(points);
});

document.getElementById("addLineBtn").addEventListener("click", () => {
    const table = document.querySelector("table");
    const newRow = table.insertRow();
    newRow.className = "data-row";
    newRow.innerHTML = `
        <td>
            <select>
                <option>Straight</option>
                <option>Curve</option>
            </select>
        </td>
        <td><input type="text"></td>
        <td><input type="text"></td>
        <td><input type="text"></td>
        <td><input type="text"></td>
        <td><button onclick="this.closest('tr').remove()">Delete</button></td>
    `;
});
