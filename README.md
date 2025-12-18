## 一、配置Python环境

### 安装

- ```
  1.打开python-3.12.4-amd64.exe
  2.勾选Use admin privileges when installing py.exe和Add python.exe to PATH
  3.选择Customize installation
  4.保持默认点击Next
  5.自定义安装目录，其他保持默认
  6.点击Install
  7.安装成功后点击Disable path length limit
  8.完成安装
  ```
  

### 配置阿里源

- ```
  1.使用管理员身份打开命令提示符
  2.输入并回车pip config set global.index-url https://mirrors.aliyun.com/pypi/simple
  3.输入并回车pip config set install.trusted-host mirrors.aliyun.com
  4.配置完成
  ```

### 依赖安装

- ```
  1.使用管理员身份打开命令提示符
  2.把XKAutoTester目录下的requirements.txt拖进命令提示符
  3.补充信息变为pip install -r <requirements.txt文件目录>
  4.回车进行安装
  5.完成安装
  ```

  

## 二、配置nodejs环境

### 安装

- ```
  1.打开node-v22.19.0-x64.msi
  2.同意条款并自定义安装目录
  3.其他保持默认进行安装
  4.完成安装
  ```

### 配置环境变量

- ```
  1.打开nodejs安装目录，新建两个文件夹node_global和node_cache
  2.使用管理员身份打开命令提示符(以下命令带双引号)
  3.npm config set prefix "node_global路径"
  4.npm config set cache "node_cache路径"
  5.Win+Q启动搜索，搜索"编辑系统环境变量",进入后点击"环境变量"
  5.新建系统变量
  -变量名:NODE_PATH
  -变量值:此处填写node_global路径，后面再拼接\node_modules
  6.打开用户变量的PATH，将C:\Users\{用户名}\AppData\Roaming\npm替换为node_global路径
  7.打开系统变量的PATH，新建一个%NODE_PATH%
  8.环境变量配置完成
  ```

### 配置国内源

- ```
  1.使用管理员身份打开命令提示符
  2.输入并回车npm config set registry https://registry.npmmirror.com
  3.输入并回车npm install -g cnpm --registry=https://registry.npmmirror.com
  4.配置完成
  ```

### 安装Appium

- ```
  1.使用管理员身份打开命令提示符
  2.输入并回车cnpm install -g appium@3.1.0
  3.输入并回车cnpm install -g @colors/colors
  4.输入并回车appium driver install uiautomator2
  5.配置完成
  ```

## 三、配置JAVA环境

### 安装

- ```
  1.打开jdk-17.0.15_windows-x64_bin.exe
  2.自定义安装目录
  3.完成安装
  ```

## 四、配置Android SDK环境

### 安装

- ```
  1.打开installer_r24.4.1-windows.exe
  2.自定义安装目录，其他默认
  3.打开SDK管理器（安装完默认自动打开）
  4.Packages只勾选Android SDK Tools、Android SDK Platform-tools、Android SDK Build-tools、Google USB Driver、Google Web Driver
  5.点击Install
  6.同意条款后安装
  7.完成安装
  ```

### Android sdk配置环境变量

- ```
  1.Win+Q启动搜索，搜索"编辑系统环境变量",进入后点击"环境变量"
  2.新建系统变量
  -变量名:ANDROID_HOME
  -变量值:所安装android-sdk文件夹的路径
  3.打开系统变量的PATH，新建%ANDROID_HOME%\build-tools\29.0.3
  4.继续新建%ANDROID_HOME%\tools
  5.继续新建%ANDROID_HOME%\platform-tools
  6.配置完成
  ```

## 五、配置USB转串口驱动环境

### 安装

- ```
  1.解压CP210x_Windows_Drivers.zip
  2.打开CP210xVCPInstaller_x64.exe
  3.默认安装
  4.完成安装
  ```
