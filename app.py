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
from pywebio.session import info as session_info
from pywebio.session import run_async, run_js
import threading
import time

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
        toast('👏 正解です！', color='#65e49b')
        run_js('localStorage.correct = parseInt(localStorage.correct || 0) + 1')
        return True
    # 检查假名是否匹配
    elif user_input.strip() == correct_answer[0]:
        toast('👏 正解です！', color='#65e49b')
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

def get_unique_session_id():
    # 获取用户 IP
    ip = session_info.user_ip
    # 获取用户代理信息
    user_agent = eval_js('navigator.userAgent')
    # 获取浏览器指纹（使用用户代理的哈希值）
    browser_fingerprint = hash(user_agent)
    # 组合成唯一标识（不再使用时间戳）
    return f"{ip}-{browser_fingerprint}"

def main():
    global online_users
    
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
    
    # 创建统计信息区域
    put_scope('stats')
    update_header(study_mode)
    
    # 创建问题区域的 scope
    put_scope('question').style('margin: 0 20px; text-align: center;')
    put_scope('alerts')  # 添加一个专门的 scope 用于显示提示信息
    
    while True:
        # 随机选择一个单词
        kanji = random.choice(list(words.keys()))
        correct_answer = words[kanji]  # [hiragana, meaning]
        
        # 继续尝试直到答对
        while True:
            # # 滚动到顶部
            # run_js('window.scrollTo(0, 0);')
            
            # 更新问题区域
            with use_scope('question', clear=True):
                # 显示汉字和释义
                put_markdown(f'## {kanji}').style("border:none;")
                put_text(f'{correct_answer[1]}')
                
                # 默认显示假名，study_mode 时不显示
                if not study_mode:
                    put_text(f'{correct_answer[0]}').style('color: #999;')
                
                    # 假名到罗马音的映射字典
                    hiragana_to_romaji = {
                        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
                        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
                        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
                        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
                        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
                        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
                        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
                        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
                        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
                        'わ': 'wa', 'を': 'wo', 'ん': 'n',
                        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
                        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
                        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
                        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
                        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
                        'きょ': 'kyo', 'しょ': 'sho', 'ちょ': 'cho', 'にょ': 'nyo',
                        'ひょ': 'hyo', 'みょ': 'myo', 'りょ': 'ryo', 'ぎょ': 'gyo',
                        'じょ': 'jo', 'びょ': 'byo', 'ぴょ': 'pyo',
                        'きゃ': 'kya', 'しゃ': 'sha', 'ちゃ': 'cha', 'にゃ': 'nya',
                        'ひゃ': 'hya', 'みゃ': 'mya', 'りゃ': 'rya', 'ぎゃ': 'gya',
                        'じゃ': 'ja', 'びゃ': 'bya', 'ぴゃ': 'pya',
                        'きゅ': 'kyu', 'しゅ': 'shu', 'ちゅ': 'chu', 'にゅ': 'nyu',
                        'ひゅ': 'hyu', 'みゅ': 'myu', 'りゅ': 'ryu', 'ぎゅ': 'gyu',
                        'じゅ': 'ju', 'びゅ': 'byu', 'ぴゅ': 'pyu',
                        'っ': '',  # 小っ的处理
                        'ー': '-',   # 长音符的处理
                        # 片假名
                        'ア': 'a', 'イ': 'i', 'ウ': 'u', 'エ': 'e', 'オ': 'o',
                        'カ': 'ka', 'キ': 'ki', 'ク': 'ku', 'ケ': 'ke', 'コ': 'ko',
                        'サ': 'sa', 'シ': 'shi', 'ス': 'su', 'セ': 'se', 'ソ': 'so',
                        'タ': 'ta', 'チ': 'chi', 'ツ': 'tsu', 'テ': 'te', 'ト': 'to',
                        'ナ': 'na', 'ニ': 'ni', 'ヌ': 'nu', 'ネ': 'ne', 'ノ': 'no',
                        'ハ': 'ha', 'ヒ': 'hi', 'フ': 'fu', 'ヘ': 'he', 'ホ': 'ho',
                        'マ': 'ma', 'ミ': 'mi', 'ム': 'mu', 'メ': 'me', 'モ': 'mo',
                        'ヤ': 'ya', 'ユ': 'yu', 'ヨ': 'yo',
                        'ラ': 'ra', 'リ': 'ri', 'ル': 'ru', 'レ': 're', 'ロ': 'ro',
                        'ワ': 'wa', 'ヲ': 'wo', 'ン': 'n',
                        'ガ': 'ga', 'ギ': 'gi', 'グ': 'gu', 'ゲ': 'ge', 'ゴ': 'go',
                        'ザ': 'za', 'ジ': 'ji', 'ズ': 'zu', 'ゼ': 'ze', 'ゾ': 'zo',
                        'ダ': 'da', 'ヂ': 'ji', 'ヅ': 'zu', 'デ': 'de', 'ド': 'do',
                        'バ': 'ba', 'ビ': 'bi', 'ブ': 'bu', 'ベ': 'be', 'ボ': 'bo',
                        'パ': 'pa', 'ピ': 'pi', 'プ': 'pu', 'ペ': 'pe', 'ポ': 'po',
                        'キョ': 'kyo', 'ショ': 'sho', 'チョ': 'cho', 'ニョ': 'nyo',
                        'ヒョ': 'hyo', 'ミョ': 'myo', 'リョ': 'ryo', 'ギョ': 'gyo',
                        'ジョ': 'jo', 'ビョ': 'byo', 'ピョ': 'pyo',
                        'キャ': 'kya', 'シャ': 'sha', 'チャ': 'cha', 'ニャ': 'nya',
                        'ヒャ': 'hya', 'ミャ': 'mya', 'リャ': 'rya', 'ギャ': 'gya',
                        'ジャ': 'ja', 'ビャ': 'bya', 'ピャ': 'pya',
                        'キュ': 'kyu', 'シュ': 'shu', 'チュ': 'chu', 'ニュ': 'nyu',
                        'ヒュ': 'hyu', 'ミュ': 'myu', 'リュ': 'ryu', 'ギュ': 'gyu',
                        'ジュ': 'ju', 'ビュ': 'byu', 'ピュ': 'pyu',
                        'ッ': '',  # 小ッ的处理
                    }
                    # 将假名转换为罗马音
                    kana = correct_answer[0]
                    romaji = ''
                    i = 0
                    while i < len(kana):
                        # 检查是否是双字符假名
                        if i + 1 < len(kana) and kana[i:i+2] in hiragana_to_romaji:
                            romaji += hiragana_to_romaji[kana[i:i+2]]
                            i += 2
                        # 单字符假名
                        elif kana[i] in hiragana_to_romaji:
                            romaji += hiragana_to_romaji[kana[i]]
                            i += 1
                        else:
                            romaji += kana[i]
                            i += 1
                            
                    # 对罗马音进行分词
                    romaji_parts = []
                    i = 0
                    while i < len(romaji):
                        # 先检查三字符的组合
                        if i + 2 < len(romaji) and romaji[i:i+3] in ['shu', 'chu', 'nyu', 'hyu', 'myu', 'ryu', 'gyu', 'byu', 'pyu', 'kyo', 'cho', 'nyo', 'hyo', 'myo', 'ryo', 'gyo', 'byo', 'pyo', 'kya', 'sha', 'cha', 'nya', 'hya', 'mya', 'rya', 'gya', 'bya', 'pya', 'kyu']:
                            romaji_parts.append(romaji[i:i+3])
                            i += 3
                        # 然后检查两字符的组合
                        elif i + 1 < len(romaji) and romaji[i:i+2] in ['ka', 'ki', 'ku', 'ke', 'ko', 'sa', 'shi', 'su', 'se', 'so', 'ta', 'chi', 'tsu', 'te', 'to', 'na', 'ni', 'nu', 'ne', 'no', 'ha', 'hi', 'fu', 'he', 'ho', 'ma', 'mi', 'mu', 'me', 'mo', 'ya', 'yu', 'yo', 'ra', 'ri', 'ru', 're', 'ro', 'wa', 'wo', 'ga', 'gi', 'gu', 'ge', 'go', 'za', 'ji', 'zu', 'ze', 'zo', 'da', 'de', 'do', 'ba', 'bi', 'bu', 'be', 'bo', 'pa', 'pi', 'pu', 'pe', 'po']:
                            romaji_parts.append(romaji[i:i+2])
                            i += 2
                        # 最后检查单字符
                        else:
                            romaji_parts.append(romaji[i])
                            i += 1
                    
                    # 用空格连接并显示
                    put_text(' '.join(romaji_parts)).style('color: #999;')
                
                # 获取用户输入，非学习模式下默认显示假名
                answer = input(f'{kanji}', placeholder=correct_answer[0] if not study_mode else '')
                
            # # 滚动到顶部
            # run_js('window.scrollTo(0, 0);')
            
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
                    put_text(f'😭 あなたの答え：{answer}').style('color: red;')
                    put_text(f'👉 正しい答え：{kanji} / {correct_answer[0]}').style('color: green;')
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

        # 获取在线用户数
        def get_online_users():
            global online_users
            with users_lock:
                # 清理超时的用户（改为60秒超时）
                current_time = time.time()
                before_cleanup = len(online_users)
                online_users = {k: v for k, v in online_users.items() if current_time - v < 60}  # 1分钟超时
                after_cleanup = len(online_users)
                
                # 打印调试信息
                print(f"Online users before cleanup: {before_cleanup}")
                print(f"Online users after cleanup: {after_cleanup}")
                print(f"Active sessions: {list(online_users.keys())}")
                
                return len(online_users)
        
        # 创建固定的头部
        online_users = get_online_users()
        with use_scope('header'):
            
            put_row([
                # 添加logo
                # https://www.svgrepo.com/svg/406038/leaf-fluttering-in-wind
                # 5dadec
                put_html('''
                    <div style="margin-top: 0; position:relative; ">
                        <svg width="42px" height="42px" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--twemoji" preserveAspectRatio="xMidYMid meet" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="#A6D388" d="M6.401 28.55c5.006 5.006 16.502 11.969 29.533-.07c-7.366-1.417-8.662-10.789-13.669-15.794c-5.006-5.007-11.991-6.139-16.998-1.133c-5.006 5.006-3.873 11.99 1.134 16.997z"></path><path fill="#77B255" d="M24.684 29.81c6.128 1.634 10.658-.738 11.076-1.156c0 0-3.786 1.751-10.359-1.476c.952-1.212 3.854-2.909 3.854-2.909c-.553-.346-4.078-.225-6.485 1.429a37.028 37.028 0 0 1-3.673-2.675l.84-.871c3.25-3.384 6.944-2.584 6.944-2.584c-.638-.613-5.599-3.441-9.583.7l-.613.638a54.727 54.727 0 0 1-1.294-1.25l-1.85-1.85l1.064-1.065c3.321-3.32 8.226-3.451 8.226-3.451c-.626-.627-6.863-2.649-10.924 1.412l-.736.735l-8.292-8.294c-.626-.627-1.692-.575-2.317.05c-.626.626-.677 1.691-.051 2.317l8.293 8.293l-.059.059C4.684 21.924 6.37 28.496 6.997 29.123c0 0 .468-5.242 3.789-8.562l.387-.388l3.501 3.502c.057.057.113.106.17.163c-2.425 4.797 1.229 10.34 1.958 10.784c0 0-1.465-4.723.48-8.635c1.526 1.195 3.02 2.095 4.457 2.755c.083 2.993 2.707 5.7 3.344 5.931c0 0-.911-3.003-.534-4.487l.135-.376z"></path><path d="M22.083 10a1.001 1.001 0 0 1-.375-1.927c.166-.068 4.016-1.698 4.416-6.163a1 1 0 1 1 1.992.178c-.512 5.711-5.451 7.755-5.661 7.839a.978.978 0 0 1-.372.073zm5 4a1 1 0 0 1-.334-1.942c.188-.068 4.525-1.711 5.38-8.188a.99.99 0 0 1 1.122-.86a.998.998 0 0 1 .86 1.122c-1.021 7.75-6.468 9.733-6.699 9.813c-.109.037-.22.055-.329.055zm3.001 6a1.001 1.001 0 0 1-.483-1.876c.027-.015 2.751-1.536 3.601-3.518a1 1 0 0 1 1.837.788c-1.123 2.62-4.339 4.408-4.475 4.483a1.003 1.003 0 0 1-.48.123z" fill="#5DADEC"></path></g></svg>   
                        <a href='/' title='' style='position:absolute; bottom:15px;color: #000;'>言葉</a>
                    </div>
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
                        }
                    </style>
                '''),
                put_grid([
                    [put_text(f'現在 {online_users}人が勉強中').style('color: #666; font-size: 0.8em;  ')], 
                    [put_buttons(
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
                    ).style('text-align: right;')],
                    
                ], ).style(' text-align: right;font-weight: normal;')
            ], size='50% 50%')
            
            [put_text(f'正解: {correct} | 不正解: {wrong} | 総単語: {len(words)}').style("""white-space: pre-wrap;
                                                                                            font-size: 0.8em;
                                                                                            font-weight: normal;
                                                                                            margin: 0 0 10px 0;
                                                                                            color: #666;
                                                                                            text-align: center;
                                                                                            border-top: 1px solid #eee;
                                                                                            padding-top: 20px;""")]
                                                                                                        
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


