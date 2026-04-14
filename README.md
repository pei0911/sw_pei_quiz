# 社工師考古題練習系統（GitHub Pages 版）

這個資料夾已經整理成可直接部署到 GitHub Pages 的靜態網站結構。

## 內含檔案
- `index.html`：網站主檔
- `.nojekyll`：避免 GitHub Pages 用 Jekyll 處理檔案
- `README.md`：部署與更新說明

## 最快部署方式（不用安裝程式）
1. 到 GitHub 建立一個公開（Public）repository。
2. 建議名稱：`socialwork-quiz`。
3. 進入 repository，按 **Add file** → **Upload files**。
4. 把本資料夾中的所有檔案上傳。
5. 上傳完成後按 **Commit changes**。
6. 到 **Settings** → **Pages**。
7. 在 **Build and deployment** 中設定：
   - **Source**：Deploy from a branch
   - **Branch**：`main`
   - **Folder**：`/ (root)`
8. 按 **Save**。
9. 等待約 30 秒到 2 分鐘後，網站會出現在：
   - `https://你的GitHub帳號.github.io/socialwork-quiz/`

## 之後要更新內容
### 手機版
1. 進入該 repository。
2. 打開要替換的檔案（通常是 `index.html`）。
3. 用 **Add file** → **Upload files**，重新上傳新版 `index.html`。
4. GitHub 若顯示同名檔案覆蓋，確認即可。
5. 按 **Commit changes**。
6. 等待 1 到 2 分鐘重新整理網站。

### 電腦版
直接把新版 `index.html` 拖進 repository 頁面覆蓋上傳，再 commit。

## 注意事項
- GitHub Pages 是靜態網站服務，適合 HTML / CSS / JavaScript。
- 如果網站有用到 Firebase，第一次開啟需要網路，且載入可能稍慢。
- GitHub Pages 官方文件指出，公開網站有每月 100 GB 軟性頻寬限制，單個已發布站點大小上限 1 GB。
