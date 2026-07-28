import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """node""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )
                
                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        // `node tauri ...` only works if a package literally named "tauri" is
        // resolvable via Node's module resolution, which is not the case for
        // projects depending on the scoped "@tauri-apps/cli" package. Resolve
        // the CLI entrypoint explicitly instead, walking up from rootDirRel to
        // find the closest node_modules containing it.
        var searchDir: File? = File(project.projectDir, rootDirRel).canonicalFile
        var tauriJs: File? = null
        while (searchDir != null) {
            val candidate = File(searchDir, "node_modules/@tauri-apps/cli/tauri.js")
            if (candidate.exists()) {
                tauriJs = candidate
                break
            }
            searchDir = searchDir.parentFile
        }
        val projectRoot = tauriJs?.parentFile?.parentFile?.parentFile?.parentFile
            ?: throw GradleException("Could not find node_modules/@tauri-apps/cli/tauri.js above ${File(project.projectDir, rootDirRel).canonicalPath}")

        val args = listOf(tauriJs.absolutePath, "android", "android-studio-script");

        project.exec {
            workingDir(projectRoot)
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}