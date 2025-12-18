"""
测试运行脚本
提供多种测试运行方式
"""
import sys
import os
from pathlib import Path
from typing import List
from utils.logger import get_logger
from utils.pytest_runner import PytestRunner

# 设置Python标准输出编码为UTF-8
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

logger = get_logger(__name__)


class TestRunner:
    """测试运行器类"""
    
    def __init__(self):
        self.pytest_runner = PytestRunner()
        self.current_test_paths = []  # 当前选定的测试路径
    
    def discover_test_directories(self) -> List[str]:
        """发现项目中的测试目录"""
        return self.pytest_runner.discover_test_directories()
    
    def set_current_test_paths(self, test_paths: List[str]) -> None:
        """设置当前选定的测试路径"""
        self.current_test_paths = test_paths
    
    def get_current_test_paths(self) -> List[str]:
        """获取当前选定的测试路径"""
        return self.current_test_paths
    
    def run_custom_tests(self, test_paths: List[str], markers: List[str] = None, test_plan_name: str = None) -> bool:
        """运行自定义路径的测试"""
        if not test_paths:
            print(">>> 未选择任何测试路径")
            return False
        
        # 如果没有提供测试计划名称，提示用户输入
        if not test_plan_name:
            test_plan_name = input(">>> 请输入测试计划名称: ").strip()
            if not test_plan_name:
                import time
                test_plan_name = f"test_plan_{int(time.time())}"
        
        print(f"\n>>> 开始运行测试...")
        print(f">>> 测试路径: {', '.join(test_paths)}")
        print(f">>> 测试计划: {test_plan_name}")
        if markers:
            print(f">>> 测试标记: {', '.join(markers)}")
        
        result = self.pytest_runner.run_custom_tests(
            test_paths=test_paths,
            markers=markers,
            generate_allure=True,
            test_plan_name=test_plan_name
        )
        
        print("\n" + "="*50)
        print(self.pytest_runner.get_test_summary(result))
        print("="*50)
        
        return result["exit_code"] == 0
    
    def run_all_tests(self, test_paths: List[str], test_plan_name: str = None) -> bool:
        """运行选定路径的所有测试"""
        return self.run_custom_tests(test_paths, [], test_plan_name)
    
    def run_smoke_tests(self, test_paths: List[str], test_plan_name: str = None) -> bool:
        """运行选定路径的冒烟测试"""
        return self.run_custom_tests(test_paths, ["smoke"], test_plan_name)
    
    def run_unit_tests(self, test_paths: List[str], test_plan_name: str = None) -> bool:
        """运行选定路径的单元功能测试"""
        return self.run_custom_tests(test_paths, ["unit"], test_plan_name)
    
    def run_exception_tests(self, test_paths: List[str], test_plan_name: str = None) -> bool:
        """运行选定路径的异常场景测试"""
        return self.run_custom_tests(test_paths, ["exception"], test_plan_name)
    
    def generate_allure_report(self, test_plan_name: str = None) -> bool:
        """生成Allure报告"""
        # 主动列出存在的测试计划供用户选择
        test_plans = self.pytest_runner.get_test_plans()
        
        if test_plans:
            print("\n>>> 可用的测试计划:")
            print("="*50)
            for i, plan in enumerate(test_plans, 1):
                print(f"{i}. {plan['name']}")
                print(f"   时间: {plan['timestamp']}")
                print(f"   路径: {plan['test_paths']}")
                print(f"   标记: {plan['markers']}")
                print("-"*50)
            
            print("0. 输入新的测试计划名称")
            print("="*50)
            
            try:
                choice = input("请选择测试计划 (输入序号): ").strip()
                if choice == "0":
                    # 用户选择输入新的测试计划名称
                    test_plan_name = input(">>> 请输入新的测试计划名称: ").strip()
                    if not test_plan_name:
                        import time
                        test_plan_name = f"test_plan_{int(time.time())}"
                elif choice.isdigit():
                    index = int(choice) - 1
                    if 0 <= index < len(test_plans):
                        test_plan_name = test_plans[index]['name']
                    else:
                        print(">>> 无效的选择，请重新选择")
                        return False
                else:
                    print(">>> 无效的输入，请重新选择")
                    return False
            except:
                print(">>> 选择测试计划时发生错误")
                return False
        else:
            # 如果没有历史记录，直接提示并返回
            print("\n>>> 暂无测试计划历史记录")
            print(">>> 请先运行测试以生成测试计划，然后才能生成报告")
            return False
        
        print(f"\n>>> 开始生成测试计划 '{test_plan_name}' 的Allure报告...")
        allure_report_path = self.pytest_runner._generate_allure_report(test_plan_name)
        
        if allure_report_path:
            print(f">>> Allure报告生成成功: {allure_report_path}")
            return True
        else:
            print(">>> Allure报告生成失败")
            return False
    
    def open_allure_report(self, test_plan_name: str = None) -> bool:
        """打开Allure报告"""
        # 主动列出存在的测试计划供用户选择
        test_plans = self.pytest_runner.get_test_plans()
        
        if test_plans:
            print("\n>>> 可用的测试计划:")
            print("="*50)
            for i, plan in enumerate(test_plans, 1):
                # 将时间戳转换为正常日期格式
                from datetime import datetime
                try:
                    timestamp = float(plan['timestamp'])
                    date_str = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
                except:
                    date_str = plan['timestamp']
                
                print(f"{i}. {plan['name']}")
                print(f"   时间: {date_str}")
                print(f"   路径: {plan['test_paths']}")
                print(f"   标记: {plan['markers']}")
                print("-"*50)
            
            print("="*50)
            
            try:
                choice = input("请选择要打开的测试计划 (输入序号): ").strip()
                if choice.isdigit():
                    index = int(choice) - 1
                    if 0 <= index < len(test_plans):
                        test_plan_name = test_plans[index]['name']
                    else:
                        print(">>> 无效的选择，请重新选择")
                        return False
                else:
                    print(">>> 无效的输入，请重新选择")
                    return False
            except:
                print(">>> 选择测试计划时发生错误")
                return False
        else:
            # 如果没有历史记录，直接提示并返回
            print("\n>>> 暂无测试计划历史记录")
            print(">>> 请先运行测试以生成测试计划，然后才能打开报告")
            return False
        
        print(f"\n>>> 正在打开测试计划 '{test_plan_name}' 的Allure报告...")
        return self.pytest_runner.open_allure_report(test_plan_name)
    
    def list_test_plans(self) -> None:
        """列出所有测试计划"""
        test_plans = self.pytest_runner.get_test_plans()
        if not test_plans:
            print(">>> 暂无测试计划历史记录")
            return
        
        print("\n>>> 测试计划历史记录:")
        print("="*60)
        for i, plan in enumerate(test_plans, 1):
            print(f"{i}. 名称: {plan['name']}")
            print(f"   路径: {plan['test_paths']}")
            print(f"   标记: {plan['markers']}")
            print(f"   报告: {plan['report_path']}")
            print(f"   时间: {plan['timestamp']}")
            print("-"*60)
    
    def clear_test_plans(self) -> None:
        """清空测试计划历史记录"""
        # 清空测试计划历史记录并保存到文件
        self.pytest_runner.test_plans.clear()
        self.pytest_runner._save_test_plans()
        print("✅ 测试计划历史记录已清空")
    
def select_test_type(test_paths: List[str]) -> str:
    """选择测试类型"""
    print("\n" + "="*50)
    print("选择测试类型")
    print("="*50)
    print("1. 运行所有测试")
    print("2. 运行冒烟测试")
    print("3. 运行单元功能测试")
    print("4. 运行异常场景测试")
    print("0. 返回目录选择")
    print("="*50)
    
    try:
        choice = input("请选择测试类型 (0-4): ").strip()
        return choice
    except Exception as e:
        print(f"❌ 选择测试类型时发生错误: {e}")
        return "0"


def run_selected_tests(runner: TestRunner, test_paths: List[str], test_type: str) -> bool:
    """运行选定的测试"""
    # 获取测试计划历史记录
    test_plans = runner.pytest_runner.get_test_plans()
    
    print("\n📋 选择测试计划")
    print("="*50)
    
    if test_plans:
        # 显示现有的测试计划
        print("📋 现有测试计划:")
        for i, plan in enumerate(test_plans, 1):
            # 将时间戳转换为正常日期格式
            from datetime import datetime
            try:
                timestamp = float(plan['timestamp'])
                date_str = datetime.fromtimestamp(timestamp).strftime('%Y-%m-%d %H:%M:%S')
            except:
                date_str = plan['timestamp']
            
            print(f"{i}. 名称: {plan['name']}")
            print(f"   路径: {plan['test_paths']}")
            print(f"   标记: {plan['markers']}")
            print(f"   时间: {date_str}")
            print("-"*50)
        
        print("0. 输入新的测试计划名称")
        print("="*50)
        
        try:
            choice = input("请选择测试计划 (输入序号): ").strip()
            if choice == "0":
                # 用户选择输入新的测试计划名称
                test_plan_name = input("📝 请输入新的测试计划名称: ").strip()
                if not test_plan_name:
                    print("❌ 测试计划名称不能为空，请重新输入")
                    return False
            elif choice.isdigit():
                index = int(choice) - 1
                if 0 <= index < len(test_plans):
                    test_plan_name = test_plans[index]['name']
                else:
                    print("❌ 无效的选择，请重新选择")
                    return False
            else:
                print("❌ 无效的输入，请重新选择")
                return False
        except:
            print("❌ 选择测试计划时发生错误")
            return False
    else:
        # 如果没有历史记录，提示用户输入
        print("📋 暂无测试计划历史记录")
        test_plan_name = input("📝 请输入测试计划名称: ").strip()
        if not test_plan_name:
            print("❌ 测试计划名称不能为空，请重新输入")
            return False
        elif test_plan_name == "0":
            # 如果用户输入0，说明可能误解了菜单选项
            print("⚠️  注意：您输入了'0'，这将被用作测试计划名称。")
            print("   如果您想返回菜单，请按Ctrl+C中断程序。")
    
    print(f"\n🚀 正在运行测试计划 '{test_plan_name}'...")
    
    if test_type == "1":
        # 运行所有测试
        return runner.run_all_tests(test_paths, test_plan_name)
    elif test_type == "2":
        # 运行冒烟测试
        return runner.run_smoke_tests(test_paths, test_plan_name)
    elif test_type == "3":
        # 运行单元功能测试
        return runner.run_unit_tests(test_paths, test_plan_name)
    elif test_type == "4":
        # 运行异常场景测试
        return runner.run_exception_tests(test_paths, test_plan_name)
    else:
        return False


def input_test_directory() -> List[str]:
    """手动输入测试目录路径"""
    print("\n" + "="*50)
    print("📁 手动输入测试目录路径")
    print("="*50)
    print("请输入测试目录的绝对路径或相对路径")
    print("支持输入多个路径，用逗号分隔")
    print("例如: tests/, test_data/, ./")
    print("="*50)
    
    try:
        path_input = input("请输入测试目录路径: ").strip()
        if not path_input:
            print("❌ 未输入任何路径")
            return []
        
        # 分割路径并验证
        paths = [path.strip() for path in path_input.split(',')]
        valid_paths = []
        
        for path in paths:
            if os.path.exists(path):
                valid_paths.append(path)
                print(f"✅ 路径验证通过: {path}")
            else:
                print(f"❌ 路径不存在: {path}")
        
        if not valid_paths:
            print("❌ 所有输入的路径都不存在")
            return []
        
        return valid_paths
        
    except Exception as e:
        print(f"❌ 输入路径时发生错误: {e}")
        return []


def main():
    """主函数"""
    runner = TestRunner()
    
    while True:
        print("\n" + "="*50)
        print("🚀 XKAutoTester - 自动化测试工具")
        print("="*50)
        
        # 显示当前选定的测试目录
        current_paths = runner.get_current_test_paths()
        if current_paths:
            print(f"📁 当前测试目录: {', '.join(current_paths)}")
        else:
            print("📁 当前测试目录: 未设置")
        
        print("="*50)
        print("📊 执行测试")
        print("1. 设置测试目录并运行测试")
        print("="*50)
        print("📋 报告管理")
        print("2. 打开Allure报告")
        print("3. 查看测试计划历史")
        print("4. 清除测试计划历史")
        print("="*50)
        print("0. 退出")
        print("="*50)
        
        try:
            choice = input("请选择操作 (0-4): ").strip()
            
            if choice == "1":
                # 设置测试目录并运行测试
                test_paths = input_test_directory()
                if not test_paths:
                    continue
                
                # 设置当前测试路径
                runner.set_current_test_paths(test_paths)
                
                # 选择测试类型并运行
                while True:
                    test_type = select_test_type(test_paths)
                    
                    if test_type == "0":
                        # 返回主菜单
                        break
                    elif test_type in ["1", "2", "3", "4"]:
                        # 运行选定的测试
                        success = run_selected_tests(runner, test_paths, test_type)
                        if success:
                            print("✅ 测试运行完成")
                        else:
                            print("❌ 测试运行失败")
                        
                        # 询问是否继续使用当前目录
                        print("\n" + "="*50)
                        print("是否继续使用当前测试目录？")
                        print("1. 继续使用当前目录")
                        print("2. 重新设置目录")
                        print("0. 返回主菜单")
                        print("="*50)
                        
                        continue_choice = input("请选择 (0-2): ").strip()
                        if continue_choice == "1":
                            continue  # 继续使用当前目录
                        elif continue_choice == "2":
                            break  # 重新设置目录
                        else:
                            break  # 返回主菜单
                    else: 
                            print("❌ 无效选择，请重新输入")
                        
            elif choice == "2":
                # 打开Allure报告
                success = runner.open_allure_report()
                if success:
                    print("✅ Allure报告已打开")
                else:
                    print("❌ 打开Allure报告失败")
                    
            elif choice == "3":
                # 查看测试计划历史
                runner.list_test_plans()
                
            elif choice == "4":
                # 清除测试计划历史
                print("\n⚠️  警告：此操作将永久删除所有测试计划历史记录！")
                confirm = input("确定要清除所有测试计划历史吗？(输入'y'确认): ").strip().lower()
                if confirm == 'y':
                    runner.clear_test_plans()
                else:
                    print("❌ 操作已取消")
                
            elif choice == "0":
                print("👋 感谢使用 XKAutoTester！")
                break
                
            else:
                print("❌ 无效选择，请重新输入")
                
        except KeyboardInterrupt:
            print("\n\n👋 用户中断操作，返回主菜单")
        except Exception as e:
            print(f"❌ 发生错误: {e}")
            print("返回主菜单")


if __name__ == "__main__":
    main()