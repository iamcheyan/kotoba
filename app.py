# -*- coding: utf-8 -*-

from pywebio.input import *
from pywebio.output import *
from pywebio.session import run_js, eval_js, set_env
from pywebio.platform.flask import start_server
from pywebio.pin import put_select, pin, pin_wait_change, put_checkbox
import random
import json
import pywebio
import urllib.parse
import sys
import argparse
from pywebio.session import info as session_info
from pywebio.session import run_async, run_js
import threading
import time
import pykakasi

# pywebio 基础配置
pywebio.config(
    title='言葉',
    theme="sketchy",    # 可用主题有： dark, sketchy, minty, yeti 
    description='単語学習ツール'
)

DICTIONARIES = [
    'base.json',
    'conversation.json'
]

# 添加全局变量来跟踪在线用户
online_users = {}
users_lock = threading.Lock()
kks = pykakasi.Kakasi()

# 从 JSON 文件加载单词库
def load_words(dictionary_file='base.json'):
    try:
        with open(dictionary_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            word_dict = {}
            
            for kanji, meaning in data.items():
                # 使用 pykakasi 获取读音
                result = kks.convert(kanji)
                
                # 分别获取每个词的假名和罗马音
                reading_parts = []
                romaji_parts = []
                
                # 逐个处理每个词
                for item in result:
                    # 获取假名
                    reading_parts.append(item['hira'])
                    # 获取罗马音
                    romaji_parts.append(item['hepburn'])
                
                # 用空格连接所有部分
                reading = ' '.join(reading_parts)  # 例如: かくてい しんこく の きげん を おしえ てください
                romaji = ' '.join(romaji_parts)   # 例如: kakutei shinkoku no kigen wo oshie tekudasai
                
                # 如果有括号中的注音,提取括号后的实际含义
                if '(' in meaning and ')' in meaning:
                    meaning = meaning[meaning.find(')')+1:].strip()
                    
                # 存储格式: [假名, 中文含义, 罗马音]
                word_dict[kanji] = [reading, meaning, romaji]
                
            print(f"词典总数: {len(word_dict)}")
            
            return word_dict
    except FileNotFoundError:
        print(f"文件 {dictionary_file} 不存在，返回基本词库")
        return {
            '私': ['わたし', '我', 'watashi'],
            '猫': ['ねこ', '猫', 'neko']
        }

def check_answer(kanji, user_input, correct_answer):
    # 移除所有空格后再比较
    user_input = user_input.replace(" ", "").strip()
    
    # 将用户输入转换为罗马音
    user_input_result = kks.convert(user_input)
    user_input_romaji = ''.join([item['hepburn'] for item in user_input_result])
    
    # 将正确答案转换为罗马音
    kanji_result = kks.convert(kanji)
    kanji_romaji = ''.join([item['hepburn'] for item in kanji_result])
    
    hiragana_result = kks.convert(correct_answer[0])
    hiragana_romaji = ''.join([item['hepburn'] for item in hiragana_result])
    
    romaji_no_space = correct_answer[2].replace(" ", "")
    
    # 检查用户输入是否匹配
    answer = user_input.strip()
    # 将答案转换为罗马音
    answer_result = kks.convert(answer)
    answer_romaji = ''.join([item['hepburn'] for item in answer_result])
    
    # 检查用户输入是否与正确答案匹配
    if answer_romaji in [kanji_romaji, hiragana_romaji, romaji_no_space]:
        toast('👏 正解です！', color='#65e49b')
        run_js('localStorage.correct = parseInt(localStorage.correct || 0) + 1')
        return True
    else:
        run_js('localStorage.wrong = parseInt(localStorage.wrong || 0) + 1')
        return False

def get_url_params():
    """获取 URL 参数"""
    try:
        params = {}
        
        # 使用 URLSearchParams 来正确解析 URL 参数
        search_params = eval_js("new URLSearchParams(window.location.search)")
        current_dict = eval_js("new URLSearchParams(window.location.search).get('dict')")
        hide_reading = eval_js("new URLSearchParams(window.location.search).get('hide_reading')")
        hide_romaji = eval_js("new URLSearchParams(window.location.search).get('hide_romaji')")
        hide_placeholder = eval_js("new URLSearchParams(window.location.search).get('hide_placeholder')")
        
        # 检查 dict 参数
        if current_dict in DICTIONARIES:
            params['dict'] = current_dict
        else:
            params['dict'] = 'base.json'  # 默认词典
            
        # 检查显示选项参数（默认都显示）
        params['show_reading'] = hide_reading is None      # 如果参数不存在则显示
        params['show_romaji'] = hide_romaji is None       # 如果参数不存在则显示
        params['show_placeholder'] = hide_placeholder is None  # 如果参数不存在则显示
        
        return params
    except Exception as e:
        print(f"Error in get_url_params: {e}")
        return {'dict': 'base.json', 'show_reading': True, 'show_romaji': True, 'show_placeholder': True}  # 出错时返回默认值

def get_unique_session_id():
    # 获取用户 IP
    ip = session_info.user_ip
    # 获取用户代理信息
    user_agent = eval_js('navigator.userAgent')
    # 获取浏览器指纹（使用用户代理的哈希值）
    browser_fingerprint = hash(user_agent)
    # 组合成唯一标识（不再使用时间戳）
    return f"{ip}-{browser_fingerprint}"

def show_settings():
    with popup('設定'):
        # 从 URL 获取当前的参数状态
        params = get_url_params()
        show_reading = params.get('show_reading', True)
        show_romaji = params.get('show_romaji', True)
        show_placeholder = params.get('show_placeholder', True)
        
        # 创建复选框组（选中表示显示）
        put_checkbox('reading_mode', options=[{'label': '読み方を表示する', 'value': 'show', 'selected': show_reading}])
        put_checkbox('romaji_mode', options=[{'label': 'ローマ字を表示する', 'value': 'show', 'selected': show_romaji}])
        put_checkbox('placeholder_mode', options=[{'label': '入力ヒントを表示する', 'value': 'show', 'selected': show_placeholder}])
        
        def on_confirm():
            # 获取当前复选框状态
            show_reading = 'show' in pin.reading_mode
            show_romaji = 'show' in pin.romaji_mode
            show_placeholder = 'show' in pin.placeholder_mode
            
            # 获取当前词典
            params = get_url_params()
            current_dict = params.get('dict', 'base.json')
            
            # 构建新的 URL
            base_url = eval_js("window.location.origin + window.location.pathname")
            new_url = f"{base_url}?dict={current_dict}"
            
            # 添加隐藏参数（如果需要隐藏则添加参数）
            if not show_reading:
                new_url += "&hide_reading=1"
            if not show_romaji:
                new_url += "&hide_romaji=1"
            if not show_placeholder:
                new_url += "&hide_placeholder=1"
            
            # 关闭弹窗并跳转
            close_popup()
            run_js(f'window.location.href = "{new_url}"')
            
        # 添加确认按钮
        put_buttons(['確認'], onclick=[on_confirm])
        
        # 等待用户操作
        while True:
            changed = pin_wait_change(['reading_mode', 'romaji_mode', 'placeholder_mode'])
            # 不要立即应用更改，等待用户点击确认按钮

def show_dictionary_selector():
    with popup('辞書選択'):
        # 从 URL 获取当前词典
        params = get_url_params()
        current_dict = params.get('dict', 'base.json')
        
        # 直接使用 DICTIONARIES 列表作为选项
        put_select('dictionary', 
                  options=[(d, d) for d in DICTIONARIES],
                  value=current_dict)
        
        def on_confirm():
            # 获取选择的词典
            selected_dict = pin.dictionary
            # 切换到新词典
            switch_dictionary(selected_dict)
            close_popup()
        
        # 添加确认按钮
        put_buttons(['確認'], onclick=[on_confirm])
        
        # 等待用户操作
        while True:
            changed = pin_wait_change('dictionary')
            # 不要立即应用更改，等待用户点击确认按钮

def is_kanji(char):
    """判断字符是否是汉字"""
    # 汉字的 Unicode 范围
    return 0x4E00 <= ord(char) <= 0x9FFF

def create_ruby_html(text, reading):
    """创建带有振り仮名的 HTML"""
    # 使用 pykakasi 重新获取每个字符的信息
    result = kks.convert(text)
    html_parts = []
    
    for item in result:
        # 如果是汉字，添加振り仮名
        if any(is_kanji(char) for char in item['orig']):
            html_parts.append(f'<ruby>{item["orig"]}<rt style="color: #666;">{item["hira"]}</rt></ruby>')
        else:
            # 如果不是汉字（比如平假名、片假名等），直接添加原文
            html_parts.append(item['orig'])
    
    # 返回完整的 HTML
    return ''.join(html_parts)

def main():
    # 在函数开始时声明所有全局变量
    global online_users
    global words
    
    # 获取 URL 参数
    params = get_url_params()
    
    # 从 URL 参数获取词典，如果没有则使用默认词典
    current_dict = params.get('dict', 'base.json')
    words = load_words(current_dict)
    
    # 设置环境，禁用固定输入面板
    set_env(input_panel_fixed=False, auto_scroll_bottom=False, output_animation=False)
    
    # 使用 JavaScript 初始化设置（如果未设置）
    run_js('''
        if (localStorage.getItem('helpMode') === null) {
            localStorage.setItem('helpMode', 'true');
        }
        if (localStorage.getItem('hideRomaji') === null) {
            localStorage.setItem('hideRomaji', 'false');
        }
    ''')
    
    # footer
    run_js("""
        var footer = document.querySelector('footer');
        if (footer) {
            footer.innerHTML = '© <a href="https://iamcheyan.com/">Cheyan</a> All Rights Reserved';
            footer.innerHTML += `
                <div style="display: inline-block; padding-left: 10px; zoom: 0.8; position: relative; top: -2px;">
                    <a href="https://github.com/iamcheyan/kotoba" target="_blank" title="GitHubでソースコードを見る">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                    </a>
                </div>`;
        }
    """)
    
    put_html('''
            <style>
                .pywebio {
                    padding-top: 10px;
                    min-height: auto;
                }
                .btn-group-sm > .btn, .btn-sm {
                    padding: 0;
                }
                .markdown-body blockquote, .markdown-body dl, .markdown-body ol, .markdown-body p, .markdown-body pre, .markdown-body table, .markdown-body ul, .markdown-body details {
                    margin: 0;
                }
                .footer {
                    background-color: #fff;
                    font-size: 0.8em;
                    position: fixed;
                    bottom: 0;
                    width: 100%;
                }
            </style>
        ''')
    # 使用新的方法获取唯一会话 ID
    user_id = get_unique_session_id()
    
    # 打印调试信息
    print(f"New user connected: {user_id}")
    
    # 注册用户
    with users_lock:
        online_users[user_id] = time.time()
        print(f"Current online users: {len(online_users)}")  # 调试信息
    
    # 定期更新用户活跃时间
    def keep_alive():
        while True:
            with users_lock:
                online_users[user_id] = time.time()
            time.sleep(60)  # 每分钟更新一次
    
    # 启动保活线程
    threading.Thread(target=keep_alive, daemon=True).start()
    
    # 注册会话结束回调
    def on_close():
        with users_lock:
            if user_id in online_users:
                del online_users[user_id]
    
    pywebio.session.register_thread(on_close)
    
    # 获取 URL 参数
    study_mode = 'study' in params
    
    # 创建统计信息区域
    put_scope('stats')
    update_header(study_mode)
    
    # 创建问题区域的 scope
    put_scope('question').style('margin: 0 20px; text-align: center;')
    put_scope('alerts')  # 添加一个专门的 scope 用于显示提示信息
    
    while True:
        # 随机选择一个单词
        kanji = random.choice(list(words.keys()))
        correct_answer = words[kanji]  # [hiragana, meaning, romaji]
        
        # 继续尝试直到答对
        while True:
            # 更新问题区域
            with use_scope('question', clear=True):
                # 显示带振り仮名的汉字（如果是汉字的话）
                ruby_html = create_ruby_html(kanji, correct_answer[0])
                put_html(f'<h2 style="border:none; margin: 20px 0;">{ruby_html}</h2>')
                
                # 显示中文含义
                put_text(f'{correct_answer[1]}')
                
                # 获取显示设置
                params = get_url_params()
                show_reading = params.get('show_reading', True)
                show_romaji = params.get('show_romaji', True)
                show_placeholder = params.get('show_placeholder', True)
                
                # 根据设置显示假名和罗马音
                if show_reading:
                    put_text(f'{correct_answer[0]}').style('color: #999;')
                if show_romaji:
                    put_text(f'{correct_answer[2]}').style('color: #999;')
                
                # 获取用户输入（根据设置显示或隐藏提示文字）
                answer = input(f'{kanji}', placeholder=correct_answer[0] if show_placeholder else '')
                
            # 处理iOS软键盘收起时的页面滚动问题
            run_js('''
                // 判断是否是iOS设备
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if(isIOS) {
                    // 记录当前滚动位置
                    const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
                    // 设置页面固定
                    document.body.style.position = 'fixed';
                    document.body.style.width = '100%';
                    document.body.style.top = -scrollTop + 'px';
                    // 延迟执行滚动到顶部
                    setTimeout(() => {
                        // 恢复页面定位
                        document.body.style.position = '';
                        document.body.style.width = '';
                        document.body.style.top = '';
                        // 滚动到顶部
                        window.scrollTo(0, 0);
                    }, 300);
                } else {
                    // 非iOS设备直接滚动到顶部
                    window.scrollTo(0, 0);
                }
            ''')
        
            # 检查答案（在专门的提示区域显示结果）
            with use_scope('alerts', clear=True):
                if check_answer(kanji, answer, correct_answer):
                    # 答对了，更新统计信息并进入下一题
                    update_header(study_mode)
                    run_js('document.querySelector("form").reset()')
                    break  # 跳出内层循环，进入下一个单词
                else:
                    # 答错了，显示错误对比
                    put_text(f'😭 あなたの答え：{answer.replace(" ", "")}').style('color: red;')
                    put_text(f'👉 正しい答え：{kanji}/{correct_answer[0].replace(" ", "")}/{correct_answer[2].replace(" ", "")}').style('color: green;')
                    run_js('document.querySelector("form").reset()')
                    continue  # 继续内层循环，重新输入

def update_header(study_mode):
    with use_scope('stats', clear=True):
        correct = eval_js('parseInt(localStorage.correct || 0)')
        wrong = eval_js('parseInt(localStorage.wrong || 0)')
        
        # 获取在线用户数
        def get_online_users():
            global online_users
            with users_lock:
                current_time = time.time()
                online_users = {k: v for k, v in online_users.items() if current_time - v < 60}
                return len(online_users)
        
        # 创建固定的头部
        online_users = get_online_users()
        with use_scope('header'):
            put_row([
                # 添加 logo
                put_html('''
                    <div style="margin-top: 0; position:relative; ">
                        <svg width="42px" height="42px" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--twemoji" preserveAspectRatio="xMidYMid meet" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="#A6D388" d="M6.401 28.55c5.006 5.006 16.502 11.969 29.533-.07c-7.366-1.417-8.662-10.789-13.669-15.794c-5.006-5.007-11.991-6.139-16.998-1.133c-5.006 5.006-3.873 11.99 1.134 16.997z"></path><path fill="#77B255" d="M24.684 29.81c6.128 1.634 10.658-.738 11.076-1.156c0 0-3.786 1.751-10.359-1.476c.952-1.212 3.854-2.909 3.854-2.909c-.553-.346-4.078-.225-6.485 1.429a37.028 37.028 0 0 1-3.673-2.675l.84-.871c3.25-3.384 6.944-2.584 6.944-2.584c-.638-.613-5.599-3.441-9.583.7l-.613.638a54.727 54.727 0 0 1-1.294-1.25l-1.85-1.85l1.064-1.065c3.321-3.32 8.226-3.451 8.226-3.451c-.626-.627-6.863-2.649-10.924 1.412l-.736.735l-8.292-8.294c-.626-.627-1.692-.575-2.317.05c-.626.626-.677 1.691-.051 2.317l8.293 8.293l-.059.059C4.684 21.924 6.37 28.496 6.997 29.123c0 0 .468-5.242 3.789-8.562l.387-.388l3.501 3.502c.057.057.113.106.17.163c-2.425 4.797 1.229 10.34 1.958 10.784c0 0-1.465-4.723.48-8.635c1.526 1.195 3.02 2.095 4.457 2.755c.083 2.993 2.707 5.7 3.344 5.931c0 0-.911-3.003-.534-4.487l.135-.376z"></path><path d="M22.083 10a1.001 1.001 0 0 1-.375-1.927c.166-.068 4.016-1.698 4.416-6.163a1 1 0 1 1 1.992.178c-.512 5.711-5.451 7.755-5.661 7.839a.978.978 0 0 1-.372.073zm5 4a1 1 0 0 1-.334-1.942c.188-.068 4.525-1.711 5.38-8.188a.99.99 0 0 1 1.122-.86a.998.998 0 0 1 .86 1.122c-1.021 7.75-6.468 9.733-6.699 9.813c-.109.037-.22.055-.329.055zm3.001 6a1.001 1.001 0 0 1-.483-1.876c.027-.015 2.751-1.536 3.601-3.518a1 1 0 0 1 1.837.788c-1.123 2.62-4.339 4.408-4.475 4.483a1.003 1.003 0 0 1-.48.123z" fill="#5DADEC"></path></g></svg>   
                        <a href='/' title='' style='position:absolute; bottom:15px;color: #000;'>言葉</a>
                    </div>
                '''),
                put_grid([
                    [put_text(f'現在 {online_users}人が勉強中').style('color: #666; font-size: 0.8em;')],
                    [put_buttons(
                        ['📘 辞書', '⚙️ 設定'],
                        onclick=[
                            lambda: show_dictionary_selector(),
                            lambda: show_settings()
                        ],
                        small=True,
                        link_style=True
                    ).style('text-align: right;')],
                ]).style('text-align: right;font-weight: normal;')
            ], size='50% 50%')
            
            put_text(f'正解: {correct} | 不正解: {wrong} | 総単語: {len(words)}').style("""
                white-space: pre-wrap;
                font-size: 0.8em;
                font-weight: normal;
                margin: 0 0 10px 0;
                color: #666;
                text-align: center;
                border-top: 1px solid #eee;
                padding-top: 20px;
            """)

def switch_dictionary(dictionary_file):
    if dictionary_file not in DICTIONARIES:
        dictionary_file = 'base.json'
    
    # 获取当前参数
    params = get_url_params()
    base_url = eval_js("window.location.origin + window.location.pathname")
    
    # 构建新的 URL，保持其他参数不变
    new_url = f"{base_url}?dict={dictionary_file}"
    
    # 保持显示设置（如果需要隐藏则添加参数）
    if not params.get('show_reading'):
        new_url += "&hide_reading=1"
    if not params.get('show_romaji'):
        new_url += "&hide_romaji=1"
    if not params.get('show_placeholder'):
        new_url += "&hide_placeholder=1"
    
    # 跳转到新的 URL
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


