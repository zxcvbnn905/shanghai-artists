function parseCsvData(filePath) {
    return new Promise((resolve, reject) => {
        Papa.parse(window.dataUrl ? window.dataUrl(filePath) : filePath, {
            download: true,
            header: true,
            complete: function(results) {
                console.log("Parsed CSV data:", results.data);
                resolve(results.data);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}