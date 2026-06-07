FROM maven:3.9-eclipse-temurin-11

WORKDIR /usr/src/app

COPY pom.xml .
RUN mvn -q dependency:go-offline

COPY src ./src

EXPOSE 3020

CMD mvn -e compile exec:java "-Dexec.mainClass=com.pollution.runner.App"