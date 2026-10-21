# 第三方组件与权利说明

本项目的代码许可不替代第三方组件的原许可证。源码依赖的准确版本以 `package-lock.json` 为准；发行包中的运行时以实际随附文件为准。

| 组件 | 用途 | 许可与核对入口 |
| --- | --- | --- |
| Electron | Windows 桌面窗口、托盘、进程与渲染运行时 | [Electron LICENSE](https://github.com/electron/electron/blob/main/LICENSE)，MIT；同时包含其他第三方组件 |
| Chromium | Electron 内置的网页渲染引擎 | [Chromium LICENSE](https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE)；具体子组件遵循各自许可证 |
| Node.js | Electron 主进程与开发脚本运行时 | [Node.js LICENSE](https://github.com/nodejs/node/blob/main/LICENSE)；含随附第三方声明 |
| @electron/asar | 制作与检查应用归档 | [官方源码与许可](https://github.com/electron/asar) |
| electron-winstaller | 构建时提供 Windows PE 资源编辑工具，不随应用源码归档分发 | [官方源码与许可](https://github.com/electron/windows-installer) |

## 再分发时必须保留

发行包随 Electron 运行时附带的 `LICENSE`、`LICENSES.chromium.html` 等许可/声明文件必须保留，不能用本项目的 MIT 文件覆盖或删除它们。发行包目录中的 `LICENSE` 是 **Electron 运行时许可**；本项目 MIT 许可在发行包外层另存为 **`LICENSE.app.txt`**，源码仓库中仍名为 `LICENSE`。美术许可和第三方说明另行随包提供。若重新打包或更换运行时，应重新核对随包许可证和依赖；本说明不是逐项第三方许可清单的替代品。

## 字体、声音与图片

- 界面使用操作系统已安装的字体（如 Microsoft YaHei UI、Segoe UI），不随本项目分发这些字体文件；相关字体权利属于各自权利人。
- 阶段提示音由 Web Audio 在运行时合成，不随包分发外部录音素材。
- 小人、纹理、图标与含美术的截图采用单独的 [素材许可](ASSET-LICENSE.md)，不适用第三方运行时的 MIT 许可。部分图像使用 AI 辅助制作，不宣称独占版权或所有来源均已经完整核实。

第三方项目名称仅用于说明兼容性和依赖关系，不代表其对本项目的认可或背书。
