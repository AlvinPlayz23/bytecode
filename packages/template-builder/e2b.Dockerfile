FROM e2bdev/code-interpreter:latest

# Install Java 21
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      openjdk-21-jdk-headless \
      wget \
      unzip \
      git && \
    rm -rf /var/lib/apt/lists/*

ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

# Set up /workspace with the Fabric example mod 1.21 starter
WORKDIR /workspace

# Clone the Fabric example mod 1.21 branch
RUN git clone --branch 1.21 --depth 1 https://github.com/FabricMC/fabric-example-mod.git /tmp/fabric-mod && \
    cp -r /tmp/fabric-mod/. /workspace/ && \
    rm -rf /tmp/fabric-mod

# Pre-download Gradle wrapper and dependencies
RUN chmod +x gradlew && \
    ./gradlew --no-daemon dependencies || true

WORKDIR /workspace
