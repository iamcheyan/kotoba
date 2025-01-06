import json
import sys

def clean_duplicates(input_file):
    with open(input_file, 'r', encoding='utf-8') as file:
        data = json.load(file)

    # 使用字典来检查重复项
    cleaned_data = {}
    value_to_key = {}  # 用于检查值的重复
    
    for key, value in data.items():
        # 移除波浪线和括号等标点符号
        key = ''.join(c for c in key if c not in '~()、，。！？；：''""【】《》（）[]「」『』〈〉…・')
        
        # 如果包含括号，只保留括号后的中文内容
        if '(' in value and ')' in value:
            end = value.find(')')
            value = value[end+1:].strip()
        
        # 检查是否有重复的值
        if value in value_to_key:
            print(f"发现重复项: {key} 和 {value_to_key[value]} 的含义都是 {value}")
            continue
            
        # 检查是否有重复的键
        if key in cleaned_data:
            print(f"发现重复键: {key}")
            continue
            
        # 记录这个值对应的键
        value_to_key[value] = key
        cleaned_data[key] = value

    # 将清理后的数据写入新的 JSON 文件
    output_file = f'cleaned_{input_file}'
    with open(output_file, 'w', encoding='utf-8') as file:
        json.dump(cleaned_data, file, ensure_ascii=False, indent=4)

    print(f"清理完成，结果已保存到 {output_file}")
    print(f"原始数据条目: {len(data)}")
    print(f"清理后条目: {len(cleaned_data)}")
    print(f"去除重复项: {len(data) - len(cleaned_data)}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("用法: python tool.py <文件名>")
    else:
        clean_duplicates(sys.argv[1])