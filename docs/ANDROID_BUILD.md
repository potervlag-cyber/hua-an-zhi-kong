# Android APK 构建

项目通过轻量 Android WebView 外壳加载本地打包的移动端资源，不需要联网即可打开核心页面。

## 环境要求

- Windows PowerShell；
- Node.js 22.13 或更高版本；
- Python 3.10 或更高版本（仅在重建化学品 SQLite 数据库时需要）；
- JDK 17（设置 `JAVA_HOME`）；
- Android SDK Platform 36 与 Build Tools 36（设置 `ANDROID_SDK_ROOT` 或 `ANDROID_HOME`）。

如果不希望设置全局环境变量，可将 `android/local.properties.example` 复制为 `android/local.properties`，再填写本机 `sdk.dir` 与 `java.home`。该本机配置已被 Git 忽略。

## 构建调试包

```powershell
npm ci
npm run build:apk
```

APK 输出到 `outputs/`。版本名称默认读取 `package.json`，也可以直接调用脚本覆盖参数：

```powershell
powershell -ExecutionPolicy Bypass -File android/build-apk.ps1 `
  -VersionName "0.2.2" `
  -VersionCode 15 `
  -OutputName "HuaAnZhiKong-v0.2.2-debug.apk"
```

构建脚本会把 `android/assets/databases/chemicals.db` 作为 `assets/databases/chemicals.db` 原样放入 APK。可在构建前运行以下命令重建并校验数据库：

```powershell
npm run db:build
```

## GitHub Actions

在仓库的 **Actions → Build Android APK → Run workflow** 中可手动生成调试 APK，构建完成后从该次任务的 Artifacts 下载。

## 正式发布注意事项

当前脚本生成的是调试签名 APK，仅适合测试和演示。发布到应用商店或正式分发前，应使用独立保管的正式密钥签名，提升版本号，完成真机兼容、安全评审、隐私合规和离线功能测试。任何签名文件与密码都不得提交到 GitHub。
