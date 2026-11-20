@echo off
title Robo de Avisos - Central de Alocacao
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias (so na primeira vez)...
  call npm install
)
if not exist .env (
  copy .env.exemplo .env >nul
  echo Preencha a chave no arquivo .env e rode de novo.
  notepad .env
  pause
  exit /b
)
:loop
node index.js
echo Robo parou. Reiniciando em 10 segundos... (feche a janela para encerrar)
timeout /t 10 >nul
goto loop
