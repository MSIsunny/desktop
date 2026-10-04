import * as React from 'react'

import { Image } from '../../../models/diff'
import { convertDDSImage } from './dds-converter'
import { PDFMediaType, rasterizePDF } from './pdf-converter'

interface IImageProps {
  /** The image contents to render */
  readonly image: Image

  /** Optional styles to apply to the image container */
  readonly style?: React.CSSProperties

  /** callback to fire after the image has been loaded */
  readonly onElementLoad?: (img: HTMLImageElement) => void
}

interface IImageState {
  /** The data URL of the renderable image, if we have one yet */
  readonly imageSource: string | null

  /** Set when the contents of the file couldn't be converted to an image */
  readonly imageError: string | null
}

export class ImageContainer extends React.Component<IImageProps, IImageState> {
  /**
   * Incremented for every load request so that the (potentially
   * asynchronous) result of a stale request can be discarded.
   */
  private loadId = 0

  public constructor(props: IImageProps) {
    super(props)
    this.state = {
      imageSource: null,
      imageError: null,
    }
  }

  public loadImage(image: Image) {
    const loadId = ++this.loadId

    if (image.mediaType === 'image/vnd-ms.dds') {
      try {
        const dataURL = convertDDSImage(image.rawContents)
        this.setState({
          imageSource: dataURL,
          imageError: null,
        })
      } catch (error) {
        console.error('Error loading DDS image:', error)
        this.setState({
          imageSource: null,
          imageError: 'Unable to render this DDS image',
        })
      }
    } else if (image.mediaType === PDFMediaType) {
      // Rasterizing the first page is asynchronous so we drop any previously
      // rendered image while we wait for it to finish.
      this.setState({ imageSource: null, imageError: null })

      rasterizePDF(image).then(
        dataURL => {
          if (this.loadId === loadId) {
            this.setState({ imageSource: dataURL })
          }
        },
        error => {
          console.error('Error rendering PDF:', error)
          if (this.loadId === loadId) {
            this.setState({
              imageSource: null,
              imageError: 'Unable to render this PDF',
            })
          }
        }
      )
    } else {
      this.setState({
        imageSource: `data:${image.mediaType};base64,${image.contents}`,
        imageError: null,
      })
    }
  }

  public componentDidMount() {
    const { image } = this.props
    this.loadImage(image)
  }

  public componentWillUnmount() {
    // Make sure the result of any in-flight conversion is ignored from now on
    this.loadId++
  }

  public componentDidUpdate(prevProps: IImageProps) {
    const { image } = this.props
    if (image === prevProps.image) {
      return
    }

    this.loadImage(image)
  }

  public render() {
    const { imageSource, imageError } = this.state

    if (imageError !== null) {
      return <div className="image-wrapper image-error">{imageError}</div>
    }

    if (!imageSource) {
      return null
    }

    return (
      <div className="image-wrapper">
        <img
          src={imageSource}
          style={this.props.style}
          onLoad={this.onLoad}
          alt=""
        />
      </div>
    )
  }

  private onLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (this.props.onElementLoad) {
      this.props.onElementLoad(e.currentTarget)
    }
  }
}
