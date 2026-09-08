uniform sampler2D globeTexture;
varying vec2 vertexUV;
varying vec3 vertexNormal;
uniform vec3 sunDirection;

void main() {
    float intensity = 1.05 - dot(vertexNormal, vec3(0.0, 0.0, 1.0));
    vec3 atmosphere = vec3(0.3, 0.6, 1.0) * pow(intensity, 1.5);
    vec3 earthColor = texture2D(globeTexture, vertexUV).xyz;
    float sunlight = dot(vertexNormal, sunDirection);
    float dayNight = smoothstep(-0.2, 0.2, sunlight);
    earthColor *= mix(0.15, 1.0, dayNight);

    gl_FragColor = vec4(atmosphere + earthColor, 1.0);
   
}