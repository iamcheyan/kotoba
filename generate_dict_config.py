#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json

def generate_dict_config():
    # 词典目录路径
    dict_dir = 'dictionaries'
    
    # 确保目录存在
    if not os.path.exists(dict_dir):
        os.makedirs(dict_dir)
    
    # 扫描目录中的所有 .json 文件
    dict_files = []
    for file in os.listdir(dict_dir):
        if file.endswith('.json'):
            dict_files.append(os.path.join(dict_dir, file))
    
    # 生成配置文件
    config = {
        'dictionaries': dict_files,
        'default_dictionary': os.path.join(dict_dir, 'base.json') if os.path.exists(os.path.join(dict_dir, 'base.json')) else dict_files[0] if dict_files else None
    }
    
    # 写入配置文件
    with open('config.json', 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=4)
    
    print(f"配置文件已生成，包含 {len(dict_files)} 个词典文件")
    print("词典列表：")
    for dict_file in dict_files:
        print(f"- {dict_file}")

if __name__ == '__main__':
    generate_dict_config() 