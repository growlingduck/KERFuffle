; KERFuffle additions to Tauri's NSIS installer (bundle.windows.nsis.installerHooks).
;
; Tauri includes this file near the top of its installer.nsi, before any page is
; declared, so the !defines below change the stock pages without forking the
; template. Checked against tauri-cli 2.12.4; recheck after upgrading the CLI.
;
; - Installs to %LOCALAPPDATA%\Programs\KERFuffle (Tauri's default is
;   %LOCALAPPDATA%\KERFuffle), the usual place for per-user apps.
; - The finish page's "Create desktop shortcut" box starts unticked.
; - The uninstaller's "Also delete my jobs and backups" box (English.nsh)
;   asks again before deleting, and removes the job database and the default
;   backup folder. Unticked, and in every update or silent uninstall, all job
;   data stays on the PC.

!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

; ---- Install folder ----------------------------------------------------------

; Tauri's .onInit sets $INSTDIR to %LOCALAPPDATA%\KERFuffle unless /D= was given
; or an earlier install recorded its folder (every KERFuffle install is under
; Programs, so only a first install lands directly in %LOCALAPPDATA%). Move
; that one under Programs. Runs from .onGUIInit, before the directory page.
;
; This file is included before Tauri defines PRODUCTNAME and the registry
; keys, so the function below can't use them: it works from $INSTDIR instead.
!macro KERF_DEFAULT_INSTDIR
  Push $R8
  Push $R9
  ${GetParent} $INSTDIR $R8
  ${If} $R8 == $LOCALAPPDATA
    ${GetFileName} $INSTDIR $R9
    StrCpy $INSTDIR "$LOCALAPPDATA\Programs\$R9"
  ${EndIf}
  Pop $R9
  Pop $R8
!macroend

!define MUI_CUSTOMFUNCTION_GUIINIT KerfGuiInit
Function KerfGuiInit
  !insertmacro KERF_DEFAULT_INSTDIR
FunctionEnd

!macro NSIS_HOOK_PREINSTALL
  ; A silent install (/S) has no GUI, so .onGUIInit never ran. Tauri's
  ; SetOutPath has already made the old folder; remove it again (only if empty).
  ${If} ${Silent}
    Push $R7
    StrCpy $R7 $INSTDIR
    !insertmacro KERF_DEFAULT_INSTDIR
    ${If} $R7 != $INSTDIR
      SetOutPath $INSTDIR
      RMDir $R7
    ${EndIf}
    Pop $R7
  ${EndIf}
!macroend

; ---- Uninstall: jobs stay unless the user really means it ---------------------

!macro NSIS_HOOK_PREUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 \
      "Delete all KERFuffle jobs on this PC?$\r$\n$\r$\nThis permanently deletes the job database and the backups in Documents\KERFuffle\Backups. It can't be undone.$\r$\n$\r$\nTo keep a job, choose No, open KERFuffle and export it first (the job's ... menu, Export job file).$\r$\n$\r$\nYes deletes the jobs. No uninstalls KERFuffle and keeps them." \
      /SD IDNO IDYES kerf_delete_confirmed
    StrCpy $DeleteAppDataCheckboxState 0
    kerf_delete_confirmed:
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $DeleteAppDataCheckboxState = 1
  ${AndIf} $UpdateMode <> 1
    SetShellVarContext current
    ; The job database, crash-recovery journal and backup settings (prompt 03, 07).
    RMDir /r "$APPDATA\${PRODUCTNAME}"
    ; Backups in the default folder. Only KERFuffle's own files are removed;
    ; the folders go only if nothing else is in them. A backup folder chosen
    ; in Settings is left alone: it may hold other files.
    Delete "$DOCUMENTS\${PRODUCTNAME}\Backups\kerfuffle-*.db"
    RMDir "$DOCUMENTS\${PRODUCTNAME}\Backups"
    RMDir "$DOCUMENTS\${PRODUCTNAME}"
  ${EndIf}
!macroend
