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
        
        # 检查值是否包含读音(括号内的内容)
        has_reading = '(' in value and ')' in value
        
        # 如果没有读音,跳过这个条目
        if not has_reading:
            continue
        
        # 如果包含括号，清理括号内的数字和加号
        if '(' in value and ')' in value:
            start = value.find('(')
            end = value.find(')')
            reading = value[start+1:end]
            # 移除阅读中的数字、加号和标点
            reading = ''.join(c for c in reading if not c.isdigit() and c not in '~()、，。！？；：''""【】《》（）[]「」『』〈〉…・+')
            value = f'({reading}){value[end+1:]}'
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