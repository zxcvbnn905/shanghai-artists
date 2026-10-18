function parseCsvData(filePath) {
    return new Promise((resolve, reject) => {
        Papa.parse(window.dataUrl ? window.dataUrl(filePath) : filePath, {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                const fields = (results.meta && results.meta.fields) || [];
                // 401/404 等错误页也会走 complete；空数据/单列内容说明拿到的不是 CSV
                if ((results.errors && results.errors.length > 0) ||
                    !Array.isArray(results.data) ||
                    results.data.length === 0 ||
                    fields.length < 2) {
                    reject(new Error('Failed to load or parse CSV: ' + filePath));
                    return;
                }
                console.log("Parsed CSV data:", results.data);
                resolve(results.data);
            },
            error: function(error) {
                reject(error);
            }
        });
    });
}