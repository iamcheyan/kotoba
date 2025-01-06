import json
import sys

def clean_duplicates(input_file):
    with open(input_file, 'r', encoding='utf-8') as file:
        data = json.load(file)

    # 使用集合来去除重复项并清理数字
    cleaned_data = {}
    for key, value in data.items():
        # 移除波浪线和括号
        # 去掉所有标点符号
        key = ''.join(c for c in key if c not in '~()、，。！？；：''""【】《》（）[]「」『』〈〉…・')
        
        # 如果包含括号，只保留括号后的中文内容
        if '(' in value and ')' in value:
            end = value.find(')')
            value = value[end+1:].strip()
            
        cleaned_data[key] = value

    # 将清理后的数据写入新的 JSON 文件
    output_file = f'cleaned_{input_file}'
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(cleaned_data, file, ensure_ascii=False, indent=4)

    print(f"清理完成，结果已保存到 {output_file}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python tool.py <文件名>")
    else:
        clean_duplicates(sys.argv[1])