// Created by Jussi Parviainen 2022
"use strict";
const DEG_TO_RAD = 0.01745329252;
let renderer, scene, camera, camera_root, raycaster, star_group = undefined;

// planet (created from gltf-file):
let polyworld = undefined;
// television objects (created from gltf-file):
let tvs = [];
const tv_body_col_default = {r: 0.5, g: 0.5, b: 0.5};
const tv_body_col_hover = {r: 0.7, g: 0.7, b: 0.7};
// scroll by pointer variables:
const ui_scrollwheel_cooldown = 0.1;
let ui_is_scrollwheel_on_cooldown = false;
let ui_scroll_with_pointer = false;
let ui_start_scroll_pointer_pos = {x:0, y: 0};
let ui_previous_pointer_pos = {x: 0, y: 0};
// variables for camera movement:
const tv_dst_from_camera = 5;
const camera_anim_rot_speed = 6;
const camera_anim_pos_speed = 6;
// index variables for targeted tv:
let camera_target_tv_index = 0; // which tv camera is targeting?
let selected_tv_index = -1; // selected tv index by pointer
let open_tv_page_index = -1; // open tv page index (gives more information about tv video content)


// On load:
window.onload = function() {

    // Init  Three.Renderer() and let's also disable canvas context menu:
    const canvas = document.getElementById('three_canvas');
    canvas.oncontextmenu = function(e) { e.preventDefault(); e.stopPropagation(); }
    renderer = new THREE.WebGLRenderer( {canvas: canvas, antialias: true});
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);

    // Init THREE.Scene():
    scene = new THREE.Scene();
    //scene.fog = new THREE.Fog(0xffffff, 0.1, 1000);

    // Init raycaster:
    raycaster = new THREE.Raycaster(new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,1));

    // Init camera to scene: (camera is moved around origin so actual camera is child of camera_root)
    camera_root = new THREE.Group(); camera_root.position.x = 0; camera_root.position.y = 0; camera_root.position.z = 0;
    scene.add(camera_root);
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000.0); // fov, aspect, near, far
    camera_root.add(camera);
    camera.position.x = 0; camera.position.y = 0; camera.position.z = 500;

    // Init lights to scene:
    const sun = new THREE.DirectionalLight(0xaaaaaa, 2);
    sun.position.set(400, 800, 400);
    scene.add(sun);
    const light = new THREE.AmbientLight( 0x404040, 2 ); // soft white light
    scene.add( light );

    // Load 3D-models: (this will load the planet models and create tv:ees)
    Load_GLTF_Files();

    // Generate background stars:
    star_group = new THREE.Group();
    let starmat = new THREE.MeshBasicMaterial({color:0xffffff});
    let stargeom = new THREE.SphereGeometry( 15, 32, 16 );
    let i = 500;
    while(i--) {
        let u = Math.random();
        let v = Math.random();
        let theta = 2 * Math.PI * u;
        let phi = Math.acos(2 * v - 1);
        let radius = 600 + Math.random() * 400;
        let mesh = new THREE.Mesh( stargeom, starmat );
        mesh.position.x = (radius * Math.sin(phi) * Math.cos(theta));
        mesh.position.y = (radius * Math.sin(phi) * Math.sin(theta));
        mesh.position.z = (radius * Math.cos(phi));
        let scale = 0.1 + Math.random() * 0.1;
        mesh.scale.set(scale, scale, scale);
        star_group.add(mesh);
    }
    scene.add(star_group);

    // Start gameloop:
    gameloop(0);

    // set window resize event:
    window.onresize = OnWindowResize;
    OnWindowResize();

    // scroll wheel event:
    window.addEventListener('wheel', (event) => {
        // Only execute if TV content page is not open:
        if (open_tv_page_index == -1) {
            // let's add small timeout to scroll wheel event, so it is not too fast:
            if (ui_is_scrollwheel_on_cooldown === true) return;
            ui_is_scrollwheel_on_cooldown = true;
            setTimeout(function() {
                ui_is_scrollwheel_on_cooldown = false;
            }, ui_scrollwheel_cooldown * 1000);
            // let's change camera target:
            if (Math.sign(event.deltaY < 0)) {
                NextCameraTarget();
            }
            else{
                PreviousCameraTarget();
            }
        }
    });
    // pointer down event:
    window.addEventListener("pointerdown", (event) => {
        // if TV content page is open --> return
        if (open_tv_page_index >= 0 && open_tv_page_index < tvs.length) return;
        // let's raycast televisions:
        RaycastTelevisions(event.clientX, event.clientY, 10);
        // if ray hit television:
        if (selected_tv_index >= 0 && selected_tv_index < tvs.length) {
            open_tv_page_index = selected_tv_index;
            tvs[open_tv_page_index].container.className = 'container fadein';
            document.getElementsByName('viewport')[0].content = "width=device-width, initial-scale=1.0, maximum-scale=12.0, minimum-scale=1.0, user-scalable=yes";
        }
        else { // else let's take the pointer position for the scroll event with pointer
            ui_start_scroll_pointer_pos.x = event.clientX;
            ui_start_scroll_pointer_pos.y = event.clientY;
            ui_scroll_with_pointer = true;
        }
    });
    // pointer move event:
    window.addEventListener('pointermove', (event) => {
        // let's track pointer position for the raycasting in gameloop function:
        ui_previous_pointer_pos.x = event.clientX;
        ui_previous_pointer_pos.y = event.clientY;
        // listen for the scroll with pointer event:
        if (ui_scroll_with_pointer) {
            let dx = event.clientX - ui_start_scroll_pointer_pos.x;
            let dy = event.clientY - ui_start_scroll_pointer_pos.y;
            let limit = 20;
            if (dx < -limit || dy > limit) {
                PreviousCameraTarget();
                ui_scroll_with_pointer = false;
            }
            else if (dx > limit || dy < -limit) {
                NextCameraTarget();
                ui_scroll_with_pointer = false;
            }
        }
    });
    // pointer up event:
    window.addEventListener('pointerup', (event) => {
        ui_scroll_with_pointer = false; // Scroll with pointer will be automatically canceled if it was true.
    });
}


// window resize function: readjust the renderer and camera.
function OnWindowResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix ();
}


// opens TV content page with given index:
function OpenTvPage(index) {
    if (index < 0 || index > tvs.length - 1) return;
    // pause screen video if target changes:
    if (camera_target_tv_index != index && camera_target_tv_index >= 0 && camera_target_tv_index < tvs.length) tvs[camera_target_tv_index].PauseScreenVideo();
    // close current TV page if open:
    CloseCurrentTvPage();
    // set parameters for current tv page and camera target:
    open_tv_page_index = index;
    camera_target_tv_index = index;
    // play camera target tv video:
    tvs[camera_target_tv_index].PlayScreenVideo();
    // open tv page:
    tvs[open_tv_page_index].container.className = 'container fadeinslow';
    window.scrollTo(0, 0); // scroll the window up
    document.getElementsByName('viewport')[0].content = "width=device-width, initial-scale=1.0, maximum-scale=12.0, minimum-scale=1.0, user-scalable=yes";
}


// close current TV content page:
function CloseCurrentTvPage() {
    if (open_tv_page_index >= 0 && open_tv_page_index < tvs.length) {
        tvs[open_tv_page_index].container.className = 'container hide';
        tvs[open_tv_page_index].PauseContainerVideos();
        open_tv_page_index = -1;
        window.scrollTo(0, 0);
        document.getElementsByName('viewport')[0].content = "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no";
    }
}


// Switch automatically to next TV content page:
function SwitchNextTvPage() {
    let next = open_tv_page_index + 1;
    if (next >= tvs.length) next = 0;
    OpenTvPage(next);
}


// Switch automatically to previous TV content page:
function SwitchPreviousTvPage() {
    let prev = open_tv_page_index - 1;
    if (prev < 0) prev = tvs.length - 1;
    OpenTvPage(next);
}


// Switch camera to target next floating televison:
function NextCameraTarget() {
    if (camera_target_tv_index >= 0 && camera_target_tv_index < tvs.length) tvs[camera_target_tv_index].PauseScreenVideo();
    camera_target_tv_index++;
    if (camera_target_tv_index >= tvs.length) camera_target_tv_index = 0;
    tvs[camera_target_tv_index].PlayScreenVideo();
    // briefly show the title of targetet tv:
    PreviewCurrentTargetTvTitle();
}


// Switch camera to target previous floating television:
function PreviousCameraTarget() {
    if (camera_target_tv_index >= 0 && camera_target_tv_index < tvs.length) tvs[camera_target_tv_index].PauseScreenVideo();
    camera_target_tv_index--;
    if (camera_target_tv_index < 0) camera_target_tv_index = tvs.length - 1;
    tvs[camera_target_tv_index].PlayScreenVideo();
    // briefly show the title of targetet tv:
    PreviewCurrentTargetTvTitle();
}


// Shows briefly currently targeted TV content page title (used when user uses the scrollwheel to change camera target)
function PreviewCurrentTargetTvTitle() {
    if (camera_target_tv_index < 0 || camera_target_tv_index > tvs.length - 1 || tvs[camera_target_tv_index].container == undefined) return;
    let header_dom = tvs[camera_target_tv_index].container.getElementsByClassName('topbarheader')[0];
    let title_dom = document.getElementById('target_title');
    let parent_dom = title_dom.parentElement;
    title_dom.remove();
    let title_new = document.createElement('p');
    title_new.innerHTML = header_dom.innerHTML;
    title_new.id = 'target_title';
    title_new.className = 'target_title_fade';
    parent_dom.appendChild(title_new);
}


// raycast all television screen quads and return index of closest TV or -1 if there was no hit:
function RaycastTelevisions(pointer_x, pointer_y, max_hit_distance = Number.MAX_VALUE) {
    raycaster.setFromCamera( new THREE.Vector2((pointer_x / window.innerWidth) * 2 - 1,  -(pointer_y / window.innerHeight * 2) + 1), camera);
    raycaster.layers.enableAll();
    let hit;
    let closest_dst = Number.MAX_VALUE;
    if (selected_tv_index != -1) tvs[selected_tv_index].SetBodyColor(tv_body_col_default.r, tv_body_col_default.g, tv_body_col_default.b);
    selected_tv_index = -1;
    let i = tvs.length;
    while(i--) {
        hit = raycaster.intersectObject(tvs[i].mesh_screen, false);
        if (hit.length > 0) {
            if (hit[0].distance < closest_dst) {
                closest_dst = hit[0].distance;
                selected_tv_index = i;
            }
        }
    }
    if (closest_dst > max_hit_distance) selected_tv_index = -1; 
    if (selected_tv_index != -1) {
        tvs[selected_tv_index].SetBodyColor(tv_body_col_hover.r, tv_body_col_hover.g, tv_body_col_hover.b);
    }
}


// Update loop:
let previoustime = 0.0;
let delta = 0.0;
function gameloop(time) {
    // request new animation frame:
    window.requestAnimationFrame(gameloop);
    // calculate delta time:
    delta = (time - previoustime) * 0.001;
    previoustime = time;
    // rotate starts:
    if (star_group) star_group.rotation.y += delta * 0.1 * DEG_TO_RAD;
    // rotate planet:
    if(polyworld != undefined) {
        polyworld.rotation.y += delta * 2.0 * DEG_TO_RAD;
        polyworld.rotation.x += delta * 1.2 * DEG_TO_RAD;
    }
    // update camera:
    if (camera_target_tv_index >= 0 && camera_target_tv_index < tvs.length) {
        // lerp camera position to target tv:
        let t_pos = delta * camera_anim_pos_speed; if (t_pos > 1.0) t_pos = 1.0;
        let target_dst = tvs[camera_target_tv_index].mesh_tv.position.z + tv_dst_from_camera;
        camera.position.z = camera.position.z + (target_dst - camera.position.z) * t_pos;
        // lerp camera root rotation to target tv:
        let t_rot = delta * camera_anim_rot_speed; if (t_rot > 1.0) t_rot = 1.0;
        let target_rot = tvs[camera_target_tv_index].root.rotation;
        camera_root.rotation.x = camera_root.rotation.x + (target_rot.x - camera_root.rotation.x) * t_rot;
        camera_root.rotation.y = camera_root.rotation.y + (target_rot.y - camera_root.rotation.y) * t_rot;
        camera_root.rotation.z = camera_root.rotation.z + (target_rot.z - camera_root.rotation.z) * t_rot;
    }
    // raycast televisions (highlighting if pointer hovers over):
    RaycastTelevisions(ui_previous_pointer_pos.x, ui_previous_pointer_pos.y, 10);
    // Update tv:ees (handles the floating animation):
    UpdateTVs(delta);
    // render scene:
    renderer.render(scene, camera);
}


// load all 3D-models and add them to scene:
function Load_GLTF_Files() {
    // create GLTFLoader:
    const loader = new THREE.GLTFLoader();
    // load model for the planet:
    loader.load('models/PolyWorld.glb', function(gltf) {
        polyworld = gltf.scene;
        polyworld.position.x = 0;  polyworld.position.y = 0; polyworld.position.z = 0;
        polyworld.scale.x = 80; polyworld.scale.y = 80; polyworld.scale.z = 80;
        scene.add(polyworld);
    });
    // create televisions:
    loader.load('models/Television.glb', function(gltf) {
        tvs[0] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:-0.6,z:300});
        tvs[0].SetScreenVideo('welcome_video');
        tvs[0].container = document.getElementById("welcome_container");
        camera_target_tv_index = 0; // make sure that camera_target_tv_index is the first television
        tvs[0].PlayScreenVideo(); // set welcome video to playing...
        PreviewCurrentTargetTvTitle(); // show title

        tvs[1] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:240,y:50,z:30}, {x:0,y:-0.6,z:400});
        tvs[1].SetScreenVideo('ismene_video');
        tvs[1].container = document.getElementById("ismene_container");

        tvs[2] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:200,y:20,z:20}, {x:0,y:-0.6,z:300});
        tvs[2].SetScreenVideo('game_dev_challenge_projects_preview_video');
        tvs[2].container = document.getElementById("game_dev_challenge_projects_container");

        tvs[3] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:10,y:110,z:45}, {x:0,y:-0.6,z:350});
        tvs[3].SetScreenVideo('dream_beats_video');
        tvs[3].container = document.getElementById("dream_beats_container");

        tvs[4] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:100,y:140,z:70}, {x:0,y:-0.6,z:400});
        tvs[4].SetScreenVideo('escape_video');
        tvs[4].container = document.getElementById("game_technology_projects_container");

        tvs[5] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:140,y:30,z:10}, {x:0,y:-0.6,z:300});
        tvs[5].SetScreenVideo('block_builder_video');
        tvs[5].container = document.getElementById("block_builder_container");

        tvs[6] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:120,y:80,z:60}, {x:0,y:-0.6,z:300});
        tvs[6].SetScreenVideo('uber_terrain_video');
        tvs[6].container = document.getElementById("uber_terrain_container");

        tvs[7] = new TV(scene, gltf, {x:0,y:0,z:0}, {x:60,y:60,z:60}, {x:0,y:-0.6,z:300});
        tvs[7].SetScreenVideo('mc_and_nsn_video');
        tvs[7].container = document.getElementById("mc_and_nsn_container");

        GenerateFastNavigationDoms();
    });
}


// rotates TV meshes slightly to create floating animation
function UpdateTVs(delta) {
    let i = tvs.length;
    while(i--) {
        tvs[i].PlayTvFloatingAnimation(delta); // rotate tv slightly
    }
}


// Generate Fast Navigation links to each TV content page.
function GenerateFastNavigationDoms() {
    // 1. get content page titles:
    let titles = [];
    let i = 0;
    while(i < tvs.length) {
        if (tvs[i].container !== undefined) {
            titles[i] = tvs[i].container.getElementsByClassName('topbarheader')[0].innerHTML;
        } else titles[i] = "Error, no topbarheader";
        i++;
    }
    // 2. Generate Fast Navigation html elements for each TV content page:
    i = 0;
    while(i < tvs.length) {
        if (tvs[i].container == undefined) {i++; continue; }
        let container = tvs[i].container.getElementsByClassName('container_content')[0];
        container.appendChild(document.createElement('br'));
        container.appendChild(document.createElement('hr'));

        let h_dom = document.createElement('h3');
        h_dom.innerHTML = 'Fast Navigation';
        container.appendChild(h_dom);
        let ul_dom = document.createElement('ul');
        ul_dom.style = 'list-style-type:none; margin:0px 0px 20px 0px; padding:0px;'; // remove list bullets and padding
        container.appendChild(ul_dom);
        let j = 0;
        while(j < tvs.length) {
            let li_dom = document.createElement('li');
            li_dom.style = 'margin: 8px 0px 8px 0px;';
            if (i != j) {
                let a_dom = document.createElement('a');
                a_dom.href = 'javascript:OpenTvPage('+ j + ');';
                a_dom.innerHTML = titles[j];
                li_dom.appendChild(a_dom);
            }
            else {
                li_dom.innerHTML = titles[j];
            }
            ul_dom.appendChild(li_dom);
            j++;
        }
        i++;
    }
}


// Class for the floating tv:
function TV(scene, tv_gltf, root_pos = {x:0, y:0, z:0}, root_rot = {x:0, y:0, z:0}, tv_pos = {x:0, y:0, z:0}, tv_rot = {x:0, y:0, z:0} ) {
    this.scene = scene
    // clone tv_gltf scene to create new tv mesh:
    this.mesh_tv = tv_gltf.scene.clone();
    this.mesh_tv.children[0].children[0].material = this.mesh_tv.children[0].children[0].material.clone();
    // init mesh for screen:
    this.mesh_screen = new THREE.Mesh(new THREE.PlaneGeometry( 2, 1 ), new THREE.MeshBasicMaterial({side: THREE.FrontSide, toneMapped: false}));
    this.screen_eps = 0.012; // screen distance from tv body
    // create parent group(tv is rotated around the planet using z offset and rotating the parent object!)
    this.root = new THREE.Group();
    this.root.add(this.mesh_tv);
    this.root.add(this.mesh_screen);
    this.scene.add(this.root);
    // dom container for detailed information (opened by clicking tv):
    this.container = undefined;
    // video dom element (used for pausing when camera is not focusing on tv):
    this.video = undefined;

    // randomized object for a floating animation:
    this.floating_anim = {
        time: (Math.random() * 1000.0),
        speed: 0.5 + Math.random() * 1,
        x_range: (Math.random() < 0.5) ?  -(5 + Math.random() * 5) : 5 + Math.random() * 5,
        z_range: (Math.random() < 0.5) ?  -(5 + Math.random() * 5) : 5 + Math.random() * 5,

        evaluateX: function() {
            return Math.cos(this.time) * this.x_range;
        },

        evaluateZ: function() {
            return Math.sin(this.time) * this.z_range;
        }
    };

    // Sets VideoTexture to television:
    this.SetScreenVideo = function(video_id) {
        this.video = document.getElementById(video_id);
        let tex = new THREE.VideoTexture(this.video);
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        //tex.needsUpdate = true; <-- no need
        this.mesh_screen.material.map = tex;
    }

    // Pauses the video assigned to television:
    this.PauseScreenVideo = function() {
        if (this.video != undefined && !this.video.paused) this.video.pause();
    }

    // Plays or continues the video assigned to television:
    this.PlayScreenVideo = function() {
        if (this.video != undefined && this.video.paused) {
            this.video.play().catch(e => {
            });
        }
    }

    // Pauses all TV content page videos. (does not pause video if className === 'loop')
    this.PauseContainerVideos = function() {
        if (this.container == undefined) return;
        let videos = this.container.getElementsByTagName("video");
        let i = videos.length;
        while(i--) {
            if (videos[i].className === 'loop') continue;
            videos[i].pause();
        }
    }

    // Set's the material color for the screen quad mesh:
    this.SetScreenColor = function(r, g, b) {
        this.mesh_screen.material.color.r = r;
        this.mesh_screen.material.color.g = g;
        this.mesh_screen.material.color.b = b;
    }

    // Set's the material color for the television body (used to signal cursor hover event)
    this.SetBodyColor = function(r, g, b) {
        this.mesh_tv.children[0].children[0].material.color.r = r;
        this.mesh_tv.children[0].children[0].material.color.g = g;
        this.mesh_tv.children[0].children[0].material.color.b = b;
    }
    this.SetBodyColor(tv_body_col_default.r, tv_body_col_default.g, tv_body_col_default.b);

    // Set the position of tv root
    this.SetRootPosition = function(x, y, z) {
        this.root.position.x = x;
        this.root.position.y = y;
        this.root.position.z = z;
    }
    this.SetRootPosition(root_pos.x, root_pos.y, root_pos.z);

    // Set the rotation of the root:
    this.SetRootRotation = function(x,y,z) {
        this.root.rotation.x = x * 0.01745329252;
        this.root.rotation.y = y * 0.01745329252;
        this.root.rotation.z = z * 0.01745329252;
    }
    this.SetRootRotation(root_rot.x, root_rot.y, root_rot.z);

    // Set the position of the television body and screen (remember that tv is a child object of the root!)
    this.SetTvPosition = function(x, y, z) {
        this.mesh_tv.position.x = x;
        this.mesh_tv.position.y = y;
        this.mesh_tv.position.z = z;

        let up = new THREE.Vector3( 0, 1, 0 ).applyQuaternion( this.mesh_tv.quaternion );
        let forward = new THREE.Vector3( 0, 0, 1 ).applyQuaternion( this.mesh_tv.quaternion );
        this.mesh_screen.position.x = this.mesh_tv.position.x + up.x * 0.8 + forward.x * this.screen_eps;
        this.mesh_screen.position.y = this.mesh_tv.position.y + up.y * 0.8 + forward.y * this.screen_eps;
        this.mesh_screen.position.z = this.mesh_tv.position.z + up.z * 0.8 + forward.z * this.screen_eps;
    }
    this.SetTvPosition(tv_pos.x, tv_pos.y, tv_pos.z);

    // Set the rotation of the television body and screen (remember that tv is a child object of the root!)
    this.SetTvRotation = function(x, y, z) {
        this.mesh_tv.rotation.x = x * 0.01745329252;
        this.mesh_tv.rotation.y = y * 0.01745329252;
        this.mesh_tv.rotation.z = z * 0.01745329252;
        
        let up = new THREE.Vector3( 0, 1, 0 ).applyQuaternion( this.mesh_tv.quaternion );
        let forward = new THREE.Vector3( 0, 0, 1 ).applyQuaternion( this.mesh_tv.quaternion );
        this.mesh_screen.position.x = this.mesh_tv.position.x + up.x * 0.8 + forward.x * this.screen_eps;
        this.mesh_screen.position.y = this.mesh_tv.position.y + up.y * 0.8 + forward.y * this.screen_eps;
        this.mesh_screen.position.z = this.mesh_tv.position.z + up.z * 0.8 + forward.z * this.screen_eps;
        this.mesh_screen.rotation.x = this.mesh_tv.rotation.x;
        this.mesh_screen.rotation.y = this.mesh_tv.rotation.y;
        this.mesh_screen.rotation.z = this.mesh_tv.rotation.z;
    }
    this.SetTvRotation(tv_rot.x, tv_rot.y, tv_rot.z);

    // Plays the tv floating animation.
    this.PlayTvFloatingAnimation = function(delta) {
        this.floating_anim.time += delta * this.floating_anim.speed;
        this.SetTvRotation(this.floating_anim.evaluateX(), 0, this.floating_anim.evaluateZ());
    }
}