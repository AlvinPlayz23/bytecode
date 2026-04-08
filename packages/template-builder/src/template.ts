import { Template } from "e2b";

export const template = Template()
  .fromUbuntuImage("22.04")
  .aptInstall(["openjdk-21-jdk-headless", "git", "wget", "unzip"])
  .setEnvs({
    JAVA_HOME: "/usr/lib/jvm/java-21-openjdk-amd64",
    PATH: "/usr/lib/jvm/java-21-openjdk-amd64/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
  })
  .setWorkdir("/workspace")
  .gitClone("https://github.com/FabricMC/fabric-example-mod.git", "/workspace", {
    branch: "1.21",
    depth: 1,
  })
  .runCmd("chmod +x /workspace/gradlew")
  .runCmd("cd /workspace && ./gradlew --no-daemon dependencies || true");
