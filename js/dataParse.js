function parseCsvData(filePath) {
    const url = window.dataFetchUrl ? window.dataFetchUrl(filePath) : filePath;
    const headers = window.authHeaders ? window.authHeaders() : {};
    return fetch(url, { headers })
        .then((response) => {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status + ' while loading ' + filePath);
            }
            return response.text();
        })
        .then((text) => new Promise((resolve, reject) => {
            Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const fields = (results.meta && results.meta.fields) || [];
                    // 401/404 等错误页也会被解析；空数据/单列内容说明拿到的不是 CSV
                    if ((results.errors && results.errors.length > 0) ||
                        !Array.isArray(results.data) ||
                        results.data.length === 0 ||
                        fields.length < 2) {
                        reject(new Error('Failed to parse CSV: ' + filePath));
                        return;
                    }
                    console.log("Parsed CSV data:", results.data);
                    resolve(results.data);
                },
                error: function(error) {
                    reject(error);
                }
            });
        }));
}
