# -*- coding: utf-8 -*-

from pywebio.input import *
from pywebio.output import *
from pywebio.session import run_js, eval_js, set_env
from pywebio.platform.flask import start_server
from pywebio.pin import put_select, pin, pin_wait_change
import random
import json
import pywebio
import urllib.parse
import sys
import argparse

# pywebio 基础配置
pywebio.config(
    title='言葉',
    theme="sketchy",
    description='単語学習ツール'
)

DICTIONARIES = [
    'base.json',
    'conversation.json'
]

# 从 JSON 文件加载单词库
def load_words(dictionary_file='base.json'):
    try:
        with open(dictionary_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            word_dict = {}
            
            for kanji, info in data.items():
                if '(' in info and ')' in info:
                    start = info.find('(') + 1
                    end = info.find(')')
                    reading = info[start:end]
                    meaning = info[end+1:].strip()
                    word_dict[kanji] = [reading, meaning]
            
            print(f"词典总数: {len(word_dict)}")
            return word_dict
    except FileNotFoundError:
        print(f"文件 {dictionary_file} 不存在，返回基本词库")
        return {
            '私': ['わたし', '我'],
            '猫': ['ねこ', '猫']
        }

def check_answer(kanji, user_input, correct_answer):
    # 检查汉字是否匹配
    if user_input.strip() == kanji:
        toast('正解です！')
        run_js('localStorage.correct = parseInt(localStorage.correct || 0) + 1')
        return True
    # 检查假名是否匹配
    elif user_input.strip() == correct_answer[0]:
        toast('正解です！')
        run_js('localStorage.correct = parseInt(localStorage.correct || 0) + 1')
        return True
    else:
        run_js('localStorage.wrong = parseInt(localStorage.wrong || 0) + 1')
        return False

def get_url_params():
    """获取 URL 参数"""
    try:
        full_url = eval_js("window.location.href")
        hash_value = eval_js("window.location.hash")
        search_value = eval_js("window.location.search")
        print(f"Full URL: {full_url}")
        print(f"Hash: {hash_value}")
        print(f"Search: {search_value}")
        
        params = {}
        # 检查 study 参数
        if 'study' in search_value:
            params['study'] = True
            
        # 检查 dict 参数
        if 'dict=' in search_value:
            dict_param = search_value.split('dict=')[1].split('&')[0]
            if dict_param in DICTIONARIES:
                params['dict'] = dict_param
        
        return params
    except Exception as e:
        print(f"Error in get_url_params: {e}")
        return {}

def main():
    # 在函数开始时声明全局变量
    global words
    
    # 获取 URL 参数
    params = get_url_params()
    study_mode = 'study' in params
    
    # 从 URL 参数获取词典，如果没有则使用默认词典
    current_dict = params.get('dict', 'base.json')
    words = load_words(current_dict)
    
    # 设置环境，禁用固定输入面板
    set_env(input_panel_fixed=False, auto_scroll_bottom=False, output_animation=False)
    
    # 移除 footer
    run_js("""
        document.addEventListener('DOMContentLoaded', function() {
            var footer = document.querySelector('footer');
            if (footer) {
                footer.innerHTML = '© 2025 <a href="https://iamcheyan.com/">Cheyan</a> All Rights Reserved';
            }
        });
        
        // 立即尝试修改一次
        var footer = document.querySelector('footer');
        if (footer) {
            footer.innerHTML = '© 2025 <a href="https://iamcheyan.com/">Cheyan</a> All Rights Reserved';
        }
    """)
    
    # 创建固定的头部
    with use_scope('header'):
        put_markdown('### 🌱 言葉')
        
    # 创建统计信息区域
    put_scope('stats')
    update_header(study_mode)
    
    # 创建问题区域的 scope
    put_scope('question')
    put_scope('alerts')  # 添加一个专门的 scope 用于显示提示信息
    
    while True:
        # 随机选择一个单词
        kanji = random.choice(list(words.keys()))
        correct_answer = words[kanji]  # [hiragana, meaning]
        
        # 继续尝试直到答对
        while True:
            # 每次答题前滚动到顶部
            run_js('window.scrollTo(0, 0);')
            
            # 更新问题区域
            with use_scope('question', clear=True):
                # 显示汉字和释义
                put_markdown(f'## {kanji}')
                put_text(f'意味：{correct_answer[1]}')
                
                # 默认显示假名，study_mode 时不显示
                if not study_mode:
                    put_text(f'読み方：{correct_answer[0]}').style('color: #999;')
                
                # 获取用户输入，非学习模式下默认显示假名
                answer = input(f'{kanji}', placeholder=correct_answer[0] if not study_mode else '')
            
            # 检查答案（在专门的提示区域显示结果）
            with use_scope('alerts', clear=True):
                if check_answer(kanji, answer, correct_answer):
                    # 答对了，更新统计信息并进入下一题
                    update_header(study_mode)
                    run_js('document.querySelector("form").reset()')
                    break  # 跳出内层循环，进入下一个单词
                else:
                    # 答错了，显示错误对比
                    put_text(f'あなたの答え：{answer}').style('color: red;')
                    put_text(f'正しい答え：{kanji} / {correct_answer[0]}').style('color: green;')
                    run_js('document.querySelector("form").reset()')
                    continue  # 继续内层循环，重新输入

def update_header(study_mode):
    with use_scope('stats', clear=True):
        correct = eval_js('parseInt(localStorage.correct || 0)')
        wrong = eval_js('parseInt(localStorage.wrong || 0)')
        
        # 获取当前域名和端口
        hostname = eval_js('window.location.hostname')
        port = eval_js('window.location.port')
        protocol = eval_js('window.location.protocol')
        
        # 构建基础 URL
        base_url = f"{protocol}//{hostname}"
        if port:
            base_url += f":{port}"
            
        # 获取当前词典
        current_dict = eval_js("new URLSearchParams(window.location.search).get('dict')") or 'base.json'
        
        # 构建 URL
        study_url = f"{base_url}/?dict={current_dict}"
        normal_url = f"{base_url}?dict={current_dict}"

        # 切换词典按钮
        def show_dictionary_selector():
            with popup('选择词典'):
                # 从 URL 获取当前词典
                current_dict = eval_js("new URLSearchParams(window.location.search).get('dict')") or 'base.json'
                if current_dict not in DICTIONARIES:
                    current_dict = 'base.json'
                
                # 直接使用 DICTIONARIES 列表作为选项
                put_select('dictionary', 
                          options=[(d, d) for d in DICTIONARIES],
                          value=current_dict)
                
                while True:
                    changed = pin_wait_change('dictionary')
                    if changed['name'] == 'dictionary':
                        switch_dictionary(changed['value'])
                        close_popup()
                        break


        # 添加统计信息
        put_row([
            # put_text(f'正解: {correct} | 不正解: {wrong} | 総単語: {len(words)}'), 
            put_text(f'正解: {correct} |  総単語: {len(words)}'), 
            put_html('''
                <style>
                    .btn-group-sm > .btn, .btn-sm {
                        padding: 0;
                    }
                </style>
            '''),
            put_buttons(
                [
                    '📘 辞書',
                    f'👍 通常' if study_mode else '👌 学習'
                ],
                onclick=[
                    lambda: show_dictionary_selector(),
                    lambda: run_js(f'window.location.href = "{normal_url if study_mode else study_url + "&study"}"')
                ],
                small=True,
                link_style=True
            ).style('text-align: right;')
        ], size='50% 50%')

def switch_dictionary(dictionary_file):
    global words
    print(f"Switching to dictionary: {dictionary_file}")
    
    # 获取当前 URL 并更新参数
    current_url = eval_js("window.location.href")
    base_url = current_url.split('?')[0]
    study_param = '&study' if 'study' in current_url else ''
    
    # 构建新的 URL 并跳转
    new_url = f"{base_url}?dict={dictionary_file}{study_param}"
    run_js(f'window.location.href = "{new_url}"')

if __name__ == '__main__':
    # 创建命令行参数解析器
    parser = argparse.ArgumentParser(description='単語学習')
    parser.add_argument('port', nargs='?', type=int, default=5000,
                      help='服务器端口号 (默认: 5000)')
    
    # 解析命令行参数
    args = parser.parse_args()
    
    # 启动服务器
    print(f"Starting server on port {args.port}")
    start_server(main, port=args.port, debug=True)


