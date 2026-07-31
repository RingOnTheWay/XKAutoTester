"""pytest 子包: pytest_runner facade 的深模块协作者。

模块:
- pytest_process_port: Protocol + PytestRunResult 值对象
- pytest_process: PytestProcess (subprocess.Popen + 双线程)
- args_builder: build_pytest_args 纯函数
- stats_parser: parse_test_stats 纯函数
- summary_formatter: format_test_summary 纯函数
- path_resolver: resolve_test_paths 纯函数
"""
