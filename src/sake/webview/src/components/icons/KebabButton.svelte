<script lang="ts">
    import DefaultButton from './DefaultButton.svelte';

    export let callback = () => {};
</script>

<DefaultButton {callback}>
    <!-- vertical kebab from codicons -->
    <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"
        ><path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M7.444 13.832a1 1 0 1 0 1.111-1.663 1 1 0 0 0-1.11 1.662zM8 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm0-5a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"
        /></svg
    >
</DefaultButton>
