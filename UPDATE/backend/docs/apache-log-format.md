This project parses Apache logs using the Combined Log Format. This format is a standardized structure used to capture detailed information about every request handled by the server.


# Log Configuration String
The log format is defined in the Apache configuration as follows:

```
LogFormat "%h %l %u %t \"%r\" %>s %b \"%{Referer}i\" \"%{User-agent}i\"" combined
```


# Example Log Entry

```
127.0.0.1 - frank [10/Oct/2000:13:55:36 -0700] "GET /apache_pb.gif HTTP/1.0" 200 2326 "http://www.example.com/start.html" "Mozilla/4.08 [en] (Win98; I ;Nav)"
```


# Field Definitions & Technical Standards

| Format String     | Definition | Description & Standards Compliance |
| ---------------- | ------ | ----- |
| %h       |   Remote Hostname   | The IP address or hostname of the client. |
| %l           |   Remote Logname   | The remote logname obtained via identd (if available). <br> - Returns `-` unless `mod_ident` is enabled and `IdentityCheck` is set to `On`. <br> - In this project, `mod_ident` is not used, so this field always contains `-`. |
| %u    |  Remote User   | The identity of the user determined by HTTP authentication. Returns `-` if the request was not authenticated. |
| %t |  Time   | The time the request was received. Format: [day/month/year:hour:minute:second zone]. |
| %r |  Request Line   | The first line of the request. (See detailed breakdown below). |
| %>s |  Status Code   | The HTTP response status code returned to the client (e.g., `200`, `404`, `500`). |
| %b |  Response Size   | Size of response in bytes (excluding headers). Returns `-` instead of `0` for empty responses. |
| Referer |  Referer Header   | The address of the previous web page from which a link to the currently requested page was followed. |
| User-Agent |  User-Agent   | The identification string for the client software (browser, OS, etc.). |


# Deep Dive: The Request Line (`%r`)

The `%r` field is defined by Apache as the "First line of request.", following "Current HTTP Standards". Its content varies based on the connection state and protocol compliance:

## Standard Compliance (RFC 7230)

Per [RFC 7230 Section 3.1.1](https://datatracker.ietf.org/doc/html/rfc7230#section-3.1.1), a valid request line follows the format:
`method SP request-target SP HTTP-version CRLF`

Example: `"GET /index.html HTTP/1.1"`

## Edge Cases & Exceptions:

According to the [Official Apache Documentation](https://httpd.apache.org/docs/2.4/mod/mod_log_config.html), `%r` may deviate from the standard in the following scenarios:

- Hyphen (`-`): If a connection is terminated prematurely (e.g., 408 Request Timeout) before the client sends any data, the information is "not available." Per the `mod_log_config` summary, a hyphen is used for missing values.
- Escaped Hex (`\xHH`): For security and log integrity, non-printable or special characters (such as binary data from an SSL Handshake sent to a non-SSL port) are escaped using hex sequences.
- Legacy Format: May appear as `Method Path` without the protocol version if the client uses the legacy HTTP/0.9 protocol ([W3C HTTP/0.9 Spec](https://www.w3.org/Protocols/HTTP/AsImplemented.html)).


# Deep Dive: The Referer Header

Format: `absolute-URI` or `partial-URI`

Example: `"http://www.example.com/start.html"`

References: `https://datatracker.ietf.org/doc/html/rfc7231#section-5.5.2`


# Deep Dive: The UserAgent

Format: `product *( RWS ( product / comment ) )`

Example: `"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/32.0.1700.77 Safari/537.36"`

References: `https://datatracker.ietf.org/doc/html/rfc7231#section-5.5.3`


# References
- Apache Logging Documentation: [https://httpd.apache.org/docs/2.4/logs.html](https://httpd.apache.org/docs/2.4/logs.html)
- Apache `mod_log_config` Module: [https://httpd.apache.org/docs/2.4/mod/mod_log_config.html](https://httpd.apache.org/docs/2.4/mod/mod_log_config.html)
- RFC 7230 (HTTP/1.1 Message Format): [https://datatracker.ietf.org/doc/html/rfc7230](https://datatracker.ietf.org/doc/html/rfc7230)
- RFC 7231 (Semantics and Content): [https://datatracker.ietf.org/doc/html/rfc7231](https://datatracker.ietf.org/doc/html/rfc7231)
- W3C HTTP/0.9 Standards: [https://www.w3.org/Protocols/HTTP/AsImplemented.html](https://www.w3.org/Protocols/HTTP/AsImplemented.html)