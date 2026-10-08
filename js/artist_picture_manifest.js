const fs = require('fs');
const path = require('path');

const artistsBasePath = path.join(__dirname, '..', 'data', 'artist_pictures');
const manifest = {};

try {
    const artistIdDirs = fs.readdirSync(artistsBasePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const artistId of artistIdDirs) {
        const artistPath = path.join(artistsBasePath, artistId);
        const files = fs.readdirSync(artistPath);

        const imageFiles = files.filter(file =>
            file.toLowerCase().endsWith('.jpg') ||
            file.toLowerCase().endsWith('.jpeg') ||
            file.toLowerCase().endsWith('.png') ||
            file.toLowerCase().endsWith('.gif')
        );
        if (imageFiles.length > 0) {
            manifest[artistId] = imageFiles;
        }
    }

    const manifestPath = path.join(__dirname, '..', 'data', 'artistPicture_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Artwork manifest created successfully at ${manifestPath}`);

} catch (error) {
    console.error('Error generating artwork manifest:', error);
}

/*
使用说明：
这是一个 Node.js 脚本，用于扫描 `data/artist_pictures` 目录并生成一个名为 `artistPicture_manifest.json` 的清单文件。
这个清单文件列出了每位艺术家的所有作品图片文件名。

运行方法：
每当 `data/artist_pictures` 目录中的图片（增加、删除或重命名）发生变化时，都应运行此脚本，以确保前端应用能够加载正确的图片。

1. 确保你的电脑上已经安装了 Node.js。
2. 在项目的根目录下打开终端（命令行工具）。
3. 执行以下命令：
   node js/artist_picture_manifest.js

运行后，脚本会自动更新 `data/artistPicture_manifest.json` 文件。
*/
