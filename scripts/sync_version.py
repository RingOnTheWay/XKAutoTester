#!/usr/bin/env python3
"""
版本号同步脚本
用于统一管理项目版本号，确保所有文件中的版本号一致

使用方法：
    python scripts/sync_version.py 0.2.0              # 更新版本号到 0.2.0
    python scripts/sync_version.py 0.2.0 --prerelease beta.1  # 更新版本号并设置预发布标识
    python scripts/sync_version.py --sync             # 从 version.json 同步到其他文件
    python scripts/sync_version.py --verify           # 验证所有版本号是否一致
    python scripts/sync_version.py --build-date       # 只更新构建日期
"""

import json
import argparse
import sys
import os
from pathlib import Path
from datetime import datetime

if sys.platform == 'win32':
    import locale
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8')
    if sys.stderr.encoding != 'utf-8':
        sys.stderr.reconfigure(encoding='utf-8')


def get_project_root():
    """获取项目根目录"""
    return Path(__file__).parent.parent


def read_version_json(project_root):
    """读取 version.json 文件"""
    version_file = project_root / "version.json"
    if not version_file.exists():
        return None
    
    with open(version_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_version_json(project_root, version_data):
    """写入 version.json 文件"""
    version_file = project_root / "version.json"
    with open(version_file, 'w', encoding='utf-8') as f:
        json.dump(version_data, f, indent=2, ensure_ascii=False)


def read_package_json(project_root):
    """读取 electron/package.json 文件"""
    package_file = project_root / "electron" / "package.json"
    if not package_file.exists():
        return None
    
    with open(package_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_package_json(project_root, package_data):
    """写入 electron/package.json 文件"""
    package_file = project_root / "electron" / "package.json"
    with open(package_file, 'w', encoding='utf-8') as f:
        json.dump(package_data, f, indent=2, ensure_ascii=False)


def read_pyproject_toml(project_root):
    """读取 pyproject.toml 文件"""
    import re
    pyproject_file = project_root / "pyproject.toml"
    if not pyproject_file.exists():
        return None
    
    with open(pyproject_file, 'r', encoding='utf-8') as f:
        return f.read()


def write_pyproject_toml(project_root, content):
    """写入 pyproject.toml 文件"""
    pyproject_file = project_root / "pyproject.toml"
    with open(pyproject_file, 'w', encoding='utf-8') as f:
        f.write(content)


def sync_to_pyproject_toml(project_root, version):
    """同步版本号到 pyproject.toml"""
    content = read_pyproject_toml(project_root)
    if content:
        import re
        updated_content = re.sub(
            r'^version\s*=\s*["\'][^"\']+["\']',
            f'version = "{version}"',
            content,
            flags=re.MULTILINE
        )
        write_pyproject_toml(project_root, updated_content)
        return True
    return False


def read_package_lock_json(project_root):
    """读取 electron/package-lock.json 文件"""
    lock_file = project_root / "electron" / "package-lock.json"
    if not lock_file.exists():
        return None
    
    with open(lock_file, 'r', encoding='utf-8') as f:
        return json.load(f)


def write_package_lock_json(project_root, lock_data):
    """写入 electron/package-lock.json 文件"""
    lock_file = project_root / "electron" / "package-lock.json"
    with open(lock_file, 'w', encoding='utf-8') as f:
        json.dump(lock_data, f, indent=2, ensure_ascii=False)


def sync_to_package_lock_json(project_root, full_version):
    """同步版本号到 electron/package-lock.json"""
    lock_data = read_package_lock_json(project_root)
    if lock_data:
        lock_data['version'] = full_version
        if 'packages' in lock_data and '' in lock_data['packages']:
            lock_data['packages']['']['version'] = full_version
        write_package_lock_json(project_root, lock_data)
        return True
    return False


def sync_to_uv_lock(project_root, version):
    """同步版本号到 uv.lock (项目自身 package xkauto-tester)"""
    import re
    lock_file = project_root / "uv.lock"
    if not lock_file.exists():
        return False

    with open(lock_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 匹配 [[package]] 块中 name = "xkauto-tester" 紧随的 version = "..."
    pattern = r'(name\s*=\s*"xkauto-tester"\s*\nversion\s*=\s*)"[^"]+"'
    if not re.search(pattern, content):
        return False  # 未找到 xkauto-tester package

    updated_content = re.sub(
        pattern,
        rf'\g<1>"{version}"',
        content,
        count=1
    )

    if updated_content != content:
        with open(lock_file, 'w', encoding='utf-8') as f:
            f.write(updated_content)
    return True  # 文件存在且包含目标 package，视为已处理


def sync_to_readme_badges(project_root, full_version):
    """同步版本号到 README.md / docs/README_EN.md 中的 shields.io Version badge"""
    import re
    # shields.io URL 中字面 '-' 编码为 '--'
    url_version = full_version.replace('-', '--')
    target_badge = f"Version-{url_version}-9cf"
    # 匹配 Version-<version>-9cf，版本部分允许数字/字母/点及 '--' 分隔
    pattern = re.compile(r'Version-[0-9A-Za-z.]+(?:--[0-9A-Za-z.]+)*-9cf')

    readme_paths = [
        project_root / "README.md",
        project_root / "docs" / "README_EN.md",
    ]
    any_updated = False
    for readme_path in readme_paths:
        if not readme_path.exists():
            continue
        content = readme_path.read_text(encoding='utf-8')
        if not pattern.search(content):
            continue
        updated = pattern.sub(target_badge, content)
        if updated != content:
            readme_path.write_text(updated, encoding='utf-8')
            print(f"✅ 已同步到 {readme_path.relative_to(project_root)}")
            any_updated = True
    return any_updated


def update_build_date(version_data):
    """更新构建日期"""
    version_data['buildDate'] = datetime.now().strftime('%Y-%m-%d')
    return version_data


def update_version(version_data, new_version, prerelease=None):
    """更新版本号"""
    version_data['version'] = new_version
    
    if prerelease:
        version_data['prerelease'] = prerelease
        version_data['fullVersion'] = f"{new_version}-{prerelease}"
    else:
        version_data['prerelease'] = ""
        version_data['fullVersion'] = new_version
    
    return version_data


def sync_to_package_json(project_root, version_data):
    """同步版本号到 electron/package.json"""
    package_data = read_package_json(project_root)
    if package_data:
        package_data['version'] = version_data.get('fullVersion', version_data['version'])
        write_package_json(project_root, package_data)
        return True
    return False


def verify_versions(project_root):
    """验证所有版本号是否一致"""
    version_data = read_version_json(project_root)
    if not version_data:
        print("❌ version.json 文件不存在")
        return False
    
    package_data = read_package_json(project_root)
    if not package_data:
        print("❌ electron/package.json 文件不存在")
        return False
    
    version_json_version = version_data.get('version')
    package_json_version = package_data.get('version')
    full_version = version_data.get('fullVersion', version_json_version)
    
    print(f"📋 版本信息:")
    print(f"  version.json: {version_json_version}")
    print(f"  fullVersion: {full_version}")
    print(f"  electron/package.json: {package_json_version}")
    
    pyproject_content = read_pyproject_toml(project_root)
    if pyproject_content:
        import re
        match = re.search(r'^version\s*=\s*["\']([^"\']+)["\']', pyproject_content, re.MULTILINE)
        if match:
            pyproject_version = match.group(1)
            print(f"  pyproject.toml: {pyproject_version}")
    
    lock_data = read_package_lock_json(project_root)
    if lock_data:
        lock_version = lock_data.get('version')
        print(f"  electron/package-lock.json: {lock_version}")

    # 检查 uv.lock 中 xkauto-tester package 版本
    uv_lock_version = None
    uv_lock_file = project_root / "uv.lock"
    if uv_lock_file.exists():
        import re
        uv_lock_content = uv_lock_file.read_text(encoding='utf-8')
        uv_match = re.search(
            r'name\s*=\s*"xkauto-tester"\s*\nversion\s*=\s*"([^"]+)"',
            uv_lock_content
        )
        if uv_match:
            uv_lock_version = uv_match.group(1)
            print(f"  uv.lock (xkauto-tester): {uv_lock_version}")

    all_match = True
    if package_json_version != full_version:
        print("⚠️  electron/package.json 版本号不一致!")
        all_match = False

    if pyproject_content and match:
        if pyproject_version != version_json_version:
            print("⚠️  pyproject.toml 版本号不一致!")
            all_match = False

    if lock_data:
        if lock_version != full_version:
            print("⚠️  electron/package-lock.json 版本号不一致!")
            all_match = False

    if uv_lock_version is not None:
        if uv_lock_version != version_json_version:
            print("⚠️  uv.lock (xkauto-tester) 版本号不一致!")
            all_match = False
    
    if all_match:
        print("✅ 所有版本号一致")
        return True
    else:
        return False


def main():
    parser = argparse.ArgumentParser(
        description='版本号同步脚本',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s 0.2.0                        更新版本号到 0.2.0
  %(prog)s 0.2.0 --prerelease beta.1    更新版本号并设置预发布标识
  %(prog)s --sync                       从 version.json 同步到其他文件
  %(prog)s --verify                     验证所有版本号是否一致
  %(prog)s --build-date                 只更新构建日期
        """
    )
    
    parser.add_argument('version', nargs='?', help='新版本号 (例如: 0.2.0)')
    parser.add_argument('--prerelease', help='预发布标识 (例如: beta.1, dev.5)')
    parser.add_argument('--sync', action='store_true', help='从 version.json 同步到其他文件')
    parser.add_argument('--verify', action='store_true', help='验证所有版本号是否一致')
    parser.add_argument('--build-date', action='store_true', help='只更新构建日期')
    
    args = parser.parse_args()
    
    project_root = get_project_root()
    
    if args.verify:
        success = verify_versions(project_root)
        sys.exit(0 if success else 1)
    
    if args.build_date:
        version_data = read_version_json(project_root)
        if version_data:
            version_data = update_build_date(version_data)
            write_version_json(project_root, version_data)
            print(f"✅ 构建日期已更新: {version_data['buildDate']}")
            sys.exit(0)
        else:
            print("❌ version.json 文件不存在")
            sys.exit(1)
    
    if args.sync:
        version_data = read_version_json(project_root)
        if version_data:
            full_version = version_data.get('fullVersion', version_data['version'])
            version = version_data.get('version')
            
            success_count = 0
            
            if sync_to_package_json(project_root, version_data):
                print(f"✅ 已同步到 electron/package.json")
                success_count += 1
            
            if sync_to_pyproject_toml(project_root, version):
                print(f"✅ 已同步到 pyproject.toml")
                success_count += 1
            
            if sync_to_package_lock_json(project_root, full_version):
                print(f"✅ 已同步到 electron/package-lock.json")
                success_count += 1

            if sync_to_uv_lock(project_root, version):
                print(f"✅ 已同步到 uv.lock")
                success_count += 1

            if sync_to_readme_badges(project_root, full_version):
                success_count += 1

            if success_count > 0:
                print(f"✅ 版本号同步完成，共更新 {success_count} 个文件")
                sys.exit(0)
            else:
                print("❌ 同步失败")
                sys.exit(1)
        else:
            print("❌ version.json 文件不存在")
            sys.exit(1)
    
    if args.version:
        version_data = read_version_json(project_root)
        if not version_data:
            version_data = {
                'version': '0.0.0',
                'buildDate': '',
                'prerelease': '',
                'fullVersion': '0.0.0'
            }
        
        version_data = update_version(version_data, args.version, args.prerelease)
        version_data = update_build_date(version_data)
        write_version_json(project_root, version_data)
        
        print(f"✅ 版本号已更新:")
        print(f"  version: {version_data['version']}")
        print(f"  fullVersion: {version_data['fullVersion']}")
        print(f"  buildDate: {version_data['buildDate']}")
        
        full_version = version_data.get('fullVersion', version_data['version'])
        version = version_data.get('version')
        
        if sync_to_package_json(project_root, version_data):
            print(f"✅ 已同步到 electron/package.json")
        
        if sync_to_pyproject_toml(project_root, version):
            print(f"✅ 已同步到 pyproject.toml")
        
        if sync_to_package_lock_json(project_root, full_version):
            print(f"✅ 已同步到 electron/package-lock.json")

        if sync_to_uv_lock(project_root, version):
            print(f"✅ 已同步到 uv.lock")

        sync_to_readme_badges(project_root, full_version)

        sys.exit(0)
    
    parser.print_help()
    sys.exit(1)


if __name__ == '__main__':
    main()
