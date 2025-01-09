FROM python:3.12.2-alpine
 
WORKDIR /usr/src/kotoba
 
COPY . .
 
RUN apk update
 
RUN chmod a+x ./*.py

RUN pip install --no-cache-dir -r ./requirements.txt
 
ENTRYPOINT ["python","app.py" ]