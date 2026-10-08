const fs = require('fs');
const path = require('path');

const studiosBasePath = path.join(__dirname, '..', 'data', 'studio_pictures');
const manifest = {};

function scanDir(dirPath, parentKey) {
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        const key = parentKey || path.basename(dirPath);
        if (!manifest[key]) {
            manifest[key] = {};
        }

        const subdirectories = entries.filter(dirent => dirent.isDirectory());


        for (const subdir of subdirectories) {
            const subId = subdir.name;
            const subdirPath = path.join(dirPath, subId);
            const subFiles = fs.readdirSync(subdirPath)
                .filter(file => fs.statSync(path.join(subdirPath, file)).isFile() && (
                    file.toLowerCase().endsWith('.jpg') ||
                    file.toLowerCase().endsWith('.jpeg') ||
                    file.toLowerCase().endsWith('.png') ||
                    file.toLowerCase().endsWith('.gif')
                ));

            if (subFiles.length > 0) {
                manifest[key][subId] = subFiles;
            }
        }

    } catch (error) {
        console.error(`Error scanning directory ${dirPath}:`, error);
    }
}

try {
    const studioIdDirs = fs.readdirSync(studiosBasePath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    for (const studioId of studioIdDirs) {
        const studioPath = path.join(studiosBasePath, studioId);
        scanDir(studioPath, studioId);
    }

    const manifestPath = path.join(__dirname, '..', 'data', 'studioPicture_manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`Studio manifest created successfully at ${manifestPath}`);

} catch (error) {
    console.error('Error generating studio manifest:', error);
}

/*
使用说明：
这是一个 Node.js 脚本，用于扫描 `data/studio_pictures` 目录并生成一个名为 `studioPicture_manifest.json` 的清单文件。
这个清单文件列出了每个 studio 的所有图片文件名，支持子目录结构。

运行方法：
每当 `data/studio_pictures` 目录中的图片（增加、删除或重命名）发生变化时，都应运行此脚本，以确保前端应用能够加载正确的图片。

1. 确保你的电脑上已经安装了 Node.js。
2. 在项目的根目录下打开终端（命令行工具）。
3. 执行以下命令：
   node js/studio_picture_manifest.js

运行后，脚本会自动更新 `data/studioPicture_manifest.json` 文件。
*/
