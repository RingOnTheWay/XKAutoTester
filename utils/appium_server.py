"""
Appium服务器启动器
使用subprocess自动启动和管理Appium服务器
"""
import subprocess
import time
import threading
import requests
import logging
import os
from pathlib import Path
import datetime

from utils.config import config_manager

logger = logging.getLogger(__name__)


class AppiumServer:
    """Appium服务器管理器"""
    
    def __init__(self, host='127.0.0.1', port=4723, log_level='info'):
        """
        初始化Appium服务器配置
        
        Args:
            host: 服务器主机地址
            port: 服务器端口
            log_level: 日志级别
        """
        self.host = host
        self.port = port
        self.log_level = log_level
        self.server_url = f"http://{host}:{port}"
        self.process = None
        self._is_running = False
        
        # 查找Appium可执行文件路径
        self.appium_executable = self._find_appium_executable()
        
        # 从配置文件获取logs文件夹路径
        base_path = Path(config_manager.get("LOG_CONFIG.file_path", ".")).resolve()
        
        # 在logs文件夹下建立Appium子文件夹
        self.log_dir = base_path / "logs" / "Appium"
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        # 生成与XKAT日志格式一致的日志文件名
        current_time = datetime.datetime.now().strftime("%Y-%m-%d-%H-%M-%S")
        self.log_file = self.log_dir / f"Appium-{current_time}.log"
    
    def _find_appium_executable(self):
        """
        查找Appium可执行文件路径
        
        Returns:
            Appium可执行文件完整路径
        """
        # 检查全局npm安装路径
        npm_global_path = r'D:\Software\nodejs\node_global\appium.cmd'
        if os.path.exists(npm_global_path):
            return npm_global_path
        
        # 检查PATH环境变量中的appium
        for path in os.environ.get('PATH', '').split(os.pathsep):
            appium_path = os.path.join(path, 'appium.cmd')
            if os.path.exists(appium_path):
                return appium_path
        
        # 如果都找不到，返回'appium'让系统尝试查找
        return 'appium'
    
    def _clean_ansi_escape(self, text):
        """清理ANSI转义字符"""
        import re
        # 匹配ANSI转义序列的正则表达式
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        return ansi_escape.sub('', text)
    
    def _write_clean_log(self, log_file, text):
        """写入清理后的日志"""
        clean_text = self._clean_ansi_escape(text)
        log_file.write(clean_text)
        log_file.flush()
    
    def start(self, timeout=30):
        """
        启动Appium服务器
        
        Args:
            timeout: 启动超时时间（秒）
            
        Returns:
            bool: 启动是否成功
        """
        try:
            # 检查是否已经在运行
            if self.is_server_running():
                logger.info(f"Appium服务器已在运行: {self.server_url}")
                self._is_running = True
                return True
            
            # 构建启动命令 - Appium 3.x需要使用server子命令
            cmd = [
                self.appium_executable,
                "--address", self.host,
                "--port", str(self.port),
                "--log-no-colors"  # 禁用颜色输出，减少转义字符
            ]
            
            logger.info(f"启动Appium服务器: {' '.join(cmd)} > {self.log_file}")
            
            # 使用自定义日志处理器来清理转义字符
            self.log_file_handle = open(self.log_file, 'w', encoding='utf-8')
            self.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace',
                bufsize=1  # 设置行缓冲
            )
            
            # 启动日志读取线程
            def read_logs():
                try:
                    while True:
                        # 检查进程对象是否存在
                        if self.process is None:
                            logger.info("进程对象已为None，日志读取线程退出")
                            break
                        
                        # 检查进程是否已结束
                        if self.process.poll() is not None:
                            logger.info("进程已结束，日志读取线程退出")
                            break
                        
                        line = self.process.stdout.readline()
                        if not line:
                            time.sleep(0.1)  # 短暂休眠避免CPU占用过高
                            continue
                        
                        # 检查日志文件句柄是否已关闭
                        if hasattr(self, 'log_file_handle') and self.log_file_handle and not self.log_file_handle.closed:
                            self._write_clean_log(self.log_file_handle, line)
                        else:
                            # 如果文件句柄已关闭，直接输出到控制台
                            clean_text = self._clean_ansi_escape(line)
                            print(clean_text, end='')
                except Exception as e:
                    logger.error(f"日志读取线程异常: {e}")
            
            self.log_thread = threading.Thread(target=read_logs, daemon=True)
            self.log_thread.start()
            
            # 等待线程启动
            time.sleep(0.5)
            
            # 等待服务器启动
            start_time = time.time()
            while time.time() - start_time < timeout:
                if self.is_server_running():
                    self._is_running = True
                    logger.info(f"Appium服务器启动成功: {self.server_url}")
                    return True
                time.sleep(2)
            
            # 超时处理
            logger.error(f"Appium服务器启动超时 ({timeout}秒)")
            self.stop()
            return False
            
        except Exception as e:
            logger.error(f"启动Appium服务器失败: {e}")
            return False
    
    def stop(self):
        """停止Appium服务器"""
        if self.process:
            try:
                # 先终止进程
                self.process.terminate()
                # 等待进程结束
                self.process.wait(timeout=10)
                logger.info("Appium服务器已停止")
            except subprocess.TimeoutExpired:
                logger.warning("Appium服务器终止超时，强制杀死进程")
                self.process.kill()
            except Exception as e:
                logger.error(f"停止Appium服务器时出错: {e}")
            finally:
                # 关闭日志文件句柄
                if hasattr(self, 'log_file_handle') and self.log_file_handle:
                    try:
                        self.log_file_handle.flush()
                        self.log_file_handle.close()
                    except Exception as e:
                        logger.error(f"关闭日志文件时出错: {e}")
                
                # 等待日志读取线程安全退出
                if hasattr(self, 'log_thread') and self.log_thread.is_alive():
                    logger.info("等待日志读取线程安全退出...")
                    self.log_thread.join(timeout=5)
                    if self.log_thread.is_alive():
                        logger.warning("日志读取线程未在5秒内退出，继续执行")
                
                # 最后设置process为None
                self.process = None
                self._is_running = False
    
    def force_cleanup(self):
        """
        强制清理Appium相关进程 - 通过端口号4723查找并终止进程
        """
        try:
            import platform
            
            if platform.system() == "Windows":
                # Windows系统：通过端口号查找并终止进程
                # 使用netstat查找占用指定端口的进程
                logger.info(f"开始查找占用端口{self.port}的进程...")
                
                # 方法1：直接使用findstr过滤端口号
                result = subprocess.run(f'netstat -ano | findstr ":{self.port}"', 
                                      shell=True, capture_output=True, text=True, timeout=10)
                
                # 记录详细的netstat输出用于调试
                logger.info(f"netstat命令执行结果 - 返回码: {result.returncode}")
                if result.stdout:
                    logger.info(f"netstat输出内容:\n{result.stdout}")
                if result.stderr:
                    logger.warning(f"netstat错误输出: {result.stderr}")
                
                # 查找占用指定端口的进程ID
                pids_to_kill = []
                if result.stdout:
                    for line in result.stdout.split('\n'):
                        if line and f':{self.port}' in line and 'LISTENING' in line:
                            logger.info(f"找到匹配的行: {line}")
                            parts = line.split()
                            logger.info(f"行分割结果: {parts}")
                            if len(parts) >= 5:
                                pid = parts[-1]
                                logger.info(f"提取的PID: {pid}")
                                if pid and pid.isdigit():
                                    pids_to_kill.append(pid)
                                    logger.info(f"发现占用端口{self.port}的进程ID: {pid}")
                                else:
                                    logger.warning(f"PID不是数字: {pid}")
                            else:
                                logger.warning(f"行分割后长度不足5: {len(parts)}")
                        elif line and f':{self.port}' in line:
                            logger.info(f"找到端口{self.port}但不处于LISTENING状态: {line}")
                
                # 如果方法1没有找到，使用方法2：获取完整netstat输出再过滤
                if not pids_to_kill:
                    logger.info("使用方法2：获取完整netstat输出")
                    result = subprocess.run(['netstat', '-ano'], 
                                          capture_output=True, text=True, encoding='utf-8', timeout=10)
                    
                    logger.info(f"方法2 netstat命令执行结果 - 返回码: {result.returncode}")
                    if result.stdout:
                        logger.info(f"方法2 netstat输出内容长度: {len(result.stdout)}字符")
                        # 在完整输出中查找端口
                        for line in result.stdout.split('\n'):
                            if line and f':{self.port}' in line and 'LISTENING' in line:
                                logger.info(f"方法2找到匹配的行: {line}")
                                parts = line.split()
                                if len(parts) >= 5:
                                    pid = parts[-1]
                                    if pid and pid.isdigit():
                                        pids_to_kill.append(pid)
                                        logger.info(f"方法2发现占用端口{self.port}的进程ID: {pid}")
                    else:
                        logger.warning("方法2 netstat命令没有输出内容")
                
                # 终止所有占用端口的进程
                if pids_to_kill:
                    logger.info(f"发现{len(pids_to_kill)}个需要终止的进程: {pids_to_kill}")
                    for pid in pids_to_kill:
                        try:
                            logger.info(f"开始终止进程ID {pid}")
                            kill_result = subprocess.run(['taskkill', '/F', '/PID', pid], 
                                          capture_output=True, text=True, timeout=10)
                            logger.info(f"taskkill命令执行结果 - 返回码: {kill_result.returncode}")
                            if kill_result.stdout:
                                logger.info(f"taskkill输出: {kill_result.stdout}")
                            if kill_result.stderr:
                                logger.warning(f"taskkill错误: {kill_result.stderr}")
                            logger.info(f"已终止进程ID {pid}")
                        except Exception as e:
                            logger.error(f"终止进程ID {pid}时出错: {e}")
                else:
                    logger.info(f"未发现占用端口{self.port}的进程")
                    
                # 额外清理：查找并终止node.exe和appium相关进程
                try:
                    logger.info("开始查找node.exe进程...")
                    # 查找node.exe进程
                    result = subprocess.run(['tasklist', '/FI', 'IMAGENAME eq node.exe'], 
                                          capture_output=True, text=True, timeout=10)
                    logger.info(f"tasklist命令执行结果 - 返回码: {result.returncode}")
                    if result.stdout:
                        logger.info(f"tasklist输出:\n{result.stdout}")
                        if 'node.exe' in result.stdout:
                            logger.info("发现node.exe进程，开始终止...")
                            kill_result = subprocess.run(['taskkill', '/F', '/IM', 'node.exe'], 
                                      capture_output=True, text=True, timeout=10)
                            logger.info(f"node.exe终止结果 - 返回码: {kill_result.returncode}")
                            if kill_result.stdout:
                                logger.info(f"node.exe终止输出: {kill_result.stdout}")
                            logger.info("已终止node.exe进程")
                        else:
                            logger.info("未发现node.exe进程")
                    if result.stderr:
                        logger.warning(f"tasklist错误: {result.stderr}")
                except Exception as e:
                    logger.warning(f"清理node.exe进程时出错: {e}")
                    
            else:
                # Unix/Linux系统：通过端口号查找并终止进程
                logger.info("Unix/Linux系统端口清理...")
                result = subprocess.run(['fuser', '-k', f'{self.port}/tcp'], 
                              capture_output=True, text=True, timeout=10)
                logger.info(f"Unix/Linux系统端口{self.port}清理完成 - 返回码: {result.returncode}")
                
            # 重置实例状态
            self.process = None
            self._is_running = False
            logger.info("Appium服务器强制清理完成")
                
        except Exception as e:
            logger.error(f"强制清理进程时出错: {e}")
    
    def is_server_running(self):
        """检查Appium服务器是否在运行"""
        try:
            response = requests.get(f"{self.server_url}/status", timeout=5)
            return response.status_code == 200
        except:
            return False
    

    
    def get_status(self):
        """获取服务器状态"""
        return {
            "is_running": self._is_running,
            "server_url": self.server_url,
            "process_alive": self.process is not None and self.process.poll() is None
        }
    
    def __enter__(self):
        """上下文管理器入口"""
        self.start()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.stop()


def start_appium_server(host='127.0.0.1', port=4723, timeout=30):
    """
    快速启动Appium服务器的便捷函数
    
    Args:
        host: 服务器主机地址
        port: 服务器端口
        timeout: 启动超时时间（秒）
        
    Returns:
        AppiumServer: 服务器实例
    """
    server = AppiumServer(host, port)
    if server.start(timeout):
        return server
    else:
        return None


if __name__ == "__main__":
    # 测试代码
    import sys
    
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # 启动服务器
    with AppiumServer() as server:
        print(f"Appium服务器状态: {server.get_status()}")
        
        # 保持运行，直到用户输入
        input("按Enter键停止服务器...")