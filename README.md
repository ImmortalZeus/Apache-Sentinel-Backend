# Apache Setup Guide for This Project

This guide explains how to set up Apache on Windows and configure it to pipe logs into the project’s collector.

## Steps

1. **Clone the project**  
Pull the repository into a directory of your choice, for example:  
    ```
    D:/your_directory/...
    ```


2. **Navigate to the project directory**  
Open Command Prompt and run:  
    ```
    cd /d D:/your_directory/
    ```

3. **Install dependencies**  
    ```
    npm install
    ```

4. **Build the project**  
    ```
    npm run build
    ```
This will generate the compiled files in the `dist` folder.

5. **Download Apache HTTP Server**  
Get the latest Windows build (e.g. `httpd-2.4.66-260223-Win64-VS18.zip`) from [Apache Lounge](https://www.apachelounge.com/download/).

6. **Extract and copy Apache**  
Extract the zip file, then copy the `Apache24` folder into drive C.  
Result: `C:/Apache24`

7. **Install and start Apache service**  
Open Command Prompt with Administrator privileges:  
    ```
    cd /d C:\Apache24\bin
    ```
    ```
    httpd.exe -k install
    ```
    ```
    httpd.exe -k start
    ```


8. **Configure Apache logging**  
Open `C:\Apache24\conf\httpd.conf`.  
Inside the `<IfModule log_config_module>` section, add:  
    ```
    CustomLog "|\"C:/Program Files/nodejs/node.exe\" D:/your_directory/dist/log-collector.js" combined
    ```
    > Note: Adjust the Node.js path and project directory path to match your system.

9. **Save the configuration file**  
Save changes to `httpd.conf`.

10. **Restart Apache to apply changes**  
Open Command Prompt with Administrator privileges:  
    ```
    cd /d C:\Apache24\bin
    httpd.exe -t
    httpd.exe -k restart
    ```
The `httpd.exe -t` command checks for syntax errors before restarting.

---

## Verification

- After restart, Apache will pipe access logs into `log-collector.js`.  
- The collector will forward logs to your detection app (default port 3000).  
- Check the detection app console to confirm logs are being received.
