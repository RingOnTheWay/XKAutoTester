; XKAutoTester 自定义 NSIS 安装脚本 (electron-builder `nsis.include`)
;
; 行为说明:
;   1. 需求1(自动装入 XKAutoTester 子文件夹) — 由 electron-builder assistedInstaller 原生实现:
;      allowToChangeInstallationDirectory=true 时, instFilesPre 会检测所选目录是否含 "XKAutoTester",
;      不含则 $INSTDIR 追加 \XKAutoTester。无需在此重复。
;   2. 需求2(注册表/config 路径) — 由 app 运行期 UserDataService 管理, 非安装器职责。
;
;   3. 需求3(卸载时询问是否删除用户数据) — 仅在 BUILD_UNINSTALLER pass 启用:
;      customUnInit (在 un.onInit 函数上下文) 弹提示; customUnInstall 按选择删除
;      (优先读 HKCU\Software\XKAutoTester\UserDataPath, 回退 %APPDATA%\Xkautotester)。
;      主安装 pass 不声明该变量, 避免 makensis 未使用变量警告 (warning-as-error)。

!macro customInstallMode
  ; assisted (非 oneClick) 模式下安装模式由 electron-builder multiUser 引导页管理, 留空即可。
!macroend

!macro customHeader
!macroend

!macro customInit
!macroend

!macro customPageAfterChangeDir
!macroend

!macro customInstall
!macroend

!ifdef BUILD_UNINSTALLER
  ; ── 仅卸载器 pass: 询问并删除用户数据 ──────────────────────
  Var /GLOBAL XKA_DeleteUserData

  !macro customUnInit
    ; 卸载开始前询问是否删除用户数据 (un.onInit 函数上下文, IfSilent 合法)
    StrCpy $XKA_DeleteUserData "no"
    ${IfNot} ${Silent}
      MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "是否同时删除用户数据？$\r$\n$\r$\n选择 是 将删除用户数据目录（含配置 config、测试用例 test_cases、测试报告 logs 等）。$\r$\n选择 否 将保留用户数据。" IDYES _xkaDelYes
      Goto _xkaDelDone
      _xkaDelYes:
      StrCpy $XKA_DeleteUserData "yes"
      _xkaDelDone:
    ${EndIf}
  !macroend

  !macro customUnWelcomePage
  !macroend

  !macro customUninstallPage
  !macroend

  !macro customUnInstall
    ${If} $XKA_DeleteUserData == "yes"
      ; 优先读 app 写入的用户自定义数据路径 (UserDataService -> WindowsRegistryBridge)
      ReadRegStr $0 HKCU "Software\XKAutoTester" "UserDataPath"
      ${If} $0 == ""
        StrCpy $0 "$APPDATA\Xkautotester"
      ${EndIf}
      ; 仅删除该数据目录, 防误删任意路径
      ${If} ${FileExists} "$0"
        RMDir /r "$0"
      ${EndIf}
    ${EndIf}
  !macroend

  !macro customRemoveFiles
  !macroend

  !macro customUnInstallSection
  !macroend
!else
  ; ── 主安装 pass: 卸载相关宏留空, 不声明变量 ────────────────
  !macro customUnInit
  !macroend

  !macro customUnWelcomePage
  !macroend

  !macro customUninstallPage
  !macroend

  !macro customUnInstall
  !macroend

  !macro customRemoveFiles
  !macroend

  !macro customUnInstallSection
  !macroend
!endif